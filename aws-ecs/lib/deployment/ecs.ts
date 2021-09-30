import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import {
  Role,
  ServicePrincipal,
  ManagedPolicy,
  Effect,
  PolicyStatement
} from '@aws-cdk/aws-iam';
import { IBucket } from '@aws-cdk/aws-s3';
import { ISecret, Secret } from '@aws-cdk/aws-secretsmanager';
import { ContainerDetails, Containers } from './containers';
import { ICluster } from '@aws-cdk/aws-ecs';
import { ARecord, IHostedZone, RecordTarget } from '@aws-cdk/aws-route53';
import { ApplicationMultipleTargetGroupsFargateService } from '@aws-cdk/aws-ecs-patterns';
import { DnsValidatedCertificate } from '@aws-cdk/aws-certificatemanager';
import {
  ApplicationProtocol,
  ListenerAction
} from '@aws-cdk/aws-elasticloadbalancingv2';
import { LoadBalancerTarget } from '@aws-cdk/aws-route53-targets';

export interface ECSProps {
  env: cdk.Environment | undefined;
  prod: boolean;
  configBucket: IBucket;
  secretName: string;
  containerNames: ContainerDetails;
  agencyAddress: string;
  walletDomainName: string;
  hostAddress: string;
  zone: IHostedZone;
}

export class ECS {
  constructor(scope: cdk.Construct, id: string, props: ECSProps) {
    const {
      env,
      configBucket,
      containerNames,
      agencyAddress,
      prod,
      secretName,
      walletDomainName
    } = props;

    const secret = Secret.fromSecretNameV2(scope, `${id}ECSSecret`, secretName);

    const task = this.createTask(scope, id, props, secret);

    const vpc = new ec2.Vpc(scope, `${id}ECSLoadBalancerVpc`, {
      maxAzs: 2 // Default is all AZs in region
    });

    const cluster = new ecs.Cluster(scope, `${id}ECSCluster`, {
      vpc
    });

    const containers = new Containers(scope, `${id}ECSContainers`, {
      configBucketName: configBucket.bucketName,
      containerNames,
      env,
      hostAddress: agencyAddress,
      prod,
      secret,
      task,
      vpc,
      walletDomainName
    });

    this.addTaskToCluster(scope, id, props, cluster, task);
  }

  createTask(
    scope: cdk.Construct,
    id: string,
    props: ECSProps,
    secret: ISecret
  ): ecs.FargateTaskDefinition {
    const { configBucket } = props;
    const taskRole = new Role(scope, `${id}ECSTaskRole`, {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com')
    });
    configBucket.grantRead(taskRole); // grant read to config files

    const executionRole = new Role(scope, `${id}ECSExecutionRole`, {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com')
    });
    executionRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AmazonECSTaskExecutionRolePolicy'
      )
    );

    executionRole.addToPolicy(
      new PolicyStatement({
        resources: [secret.secretFullArn!.toString()],
        actions: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret'
        ],
        effect: Effect.ALLOW
      })
    );

    const taskDefinition = new ecs.FargateTaskDefinition(
      scope,
      `${id}ECSTask`,
      {
        executionRole,
        taskRole
      }
    );

    return taskDefinition;
  }

  addTaskToCluster(
    scope: cdk.Construct,
    id: string,
    props: ECSProps,
    cluster: ICluster,
    task: ecs.FargateTaskDefinition
  ) {
    const { hostAddress, zone } = props;
    const certificate = new DnsValidatedCertificate(scope, `${id}Certificate`, {
      domainName: hostAddress,
      hostedZone: zone
    });

    // TODO: No support for Service Deployment Options, need to set manually
    // Minimum healthy percent 0
    // Maximum percent 100
    const lbService = new ApplicationMultipleTargetGroupsFargateService(
      scope,
      `${id}Service`,
      {
        cluster,
        cpu: 512,
        desiredCount: 1,
        taskDefinition: task,
        memoryLimitMiB: 1024
      }
    );

    // Load Balancer exposes default HTTPS-port and GRPC-port to outside world
    // TODO: disable default listener on port 80
    // TODO: move aries traffic on top of HTTPS
    const loadBalancer = lbService.loadBalancer;
    loadBalancer.setAttribute('idle_timeout.timeout_seconds', '3600');
    const httpsListener = loadBalancer.addListener(`${id}HTTPSListener`, {
      protocol: ApplicationProtocol.HTTPS,
      port: 443,
      certificates: [certificate],
      defaultAction: ListenerAction.fixedResponse(404)
    });

    const grpcListener = loadBalancer.addListener(`${id}GRPCListener`, {
      protocol: ApplicationProtocol.HTTPS,
      port: 50051,
      certificates: [certificate]
    });

    new ARecord(scope, `${id}ARecord`, {
      recordName: hostAddress,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(loadBalancer)),
      zone
    });

    return { service: lbService, httpsListener, grpcListener };
  }
}