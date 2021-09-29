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
import { Secret } from '@aws-cdk/aws-secretsmanager';

export interface ECSProps {
  env: cdk.Environment | undefined;
  prod: boolean;
  configBucket: IBucket;
  secretName: string;
}

export class ECS {
  constructor(scope: cdk.Construct, id: string, props: ECSProps) {
    const task = this.createTask(scope, id, props);
    const vpc = new ec2.Vpc(scope, `${id}ECSLoadBalancerVpc`, {
      maxAzs: 2 // Default is all AZs in region
    });

    const cluster = new ecs.Cluster(scope, `${id}ECSCluster`, {
      vpc
    });
  }

  createTask(
    scope: cdk.Construct,
    id: string,
    props: ECSProps
  ): ecs.FargateTaskDefinition {
    const { configBucket, secretName } = props;
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

    const secret = Secret.fromSecretNameV2(scope, `${id}ECSSecret`, secretName);
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
}
