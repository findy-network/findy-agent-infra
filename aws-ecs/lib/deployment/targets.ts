import * as cdk from '@aws-cdk/core';
import { Port, SecurityGroup, IVpc } from '@aws-cdk/aws-ec2';
import {
  ApplicationListener,
  ApplicationProtocol,
  ApplicationProtocolVersion,
  ApplicationTargetGroup,
  ListenerCondition,
  Protocol,
  TargetType
} from '@aws-cdk/aws-elasticloadbalancingv2';
import { ContainerDetails } from './containers';
import { ApplicationMultipleTargetGroupsFargateService } from '@aws-cdk/aws-ecs-patterns';

const NFPostNumber = 2049;
const NFSPort = Port.tcp(NFPostNumber);
const PostgresPortNumber = 5432;
const PostgresPort = Port.tcp(PostgresPortNumber);
const GRPCPortNumber = 50051;
const GRPCPort = Port.tcp(GRPCPortNumber);

export interface TargetsProps {
  env: cdk.Environment | undefined;
  prod: boolean;
  containerDetails: ContainerDetails;
  grpcListener: ApplicationListener;
  httpsListener: ApplicationListener;
  service: ApplicationMultipleTargetGroupsFargateService;
  vpc: IVpc;
}

export interface TargetProps {
  containerName: string;
  containerPort: number;
  priority: number;
  paths: string[];
  efsSg?: SecurityGroup;
  dbSg?: SecurityGroup;
  healthCheckPath?: string;
}

export class Targets {
  public readonly apiPaths: string[];

  constructor(scope: cdk.Construct, id: string, props: TargetsProps) {
    const { containerDetails } = props;

    // vault gRPC + HTTPS targets
    const agentPaths = this.addAgentTarget(scope, id, props);

    // auth HTTPS target
    const authPaths = ['/register/*', '/login/*'];
    this.addHttpsTarget(scope, `${id}Auth`, props, {
      priority: 99,
      containerName: containerDetails.auth.containerName,
      containerPort: 8888,
      paths: authPaths,
      efsSg: containerDetails.auth.task?.efsSg
    });

    const vaultPaths = ['/query*'];
    this.addHttpsTarget(scope, `${id}Vault`, props, {
      priority: 98,
      containerName: containerDetails.vault.containerName,
      containerPort: 8085,
      paths: vaultPaths,
      dbSg: containerDetails.vault.task?.dbSg,
      healthCheckPath: '/health'
    });

    this.apiPaths = [...agentPaths, ...authPaths, ...vaultPaths];
  }

  addAgentTarget(
    scope: cdk.Construct,
    id: string,
    props: TargetsProps
  ): string[] {
    const { service, grpcListener, vpc, containerDetails } = props;
    const fgService = service.service;
    const agentId = `${id}AgentTargets`;

    // gRPC Target
    grpcListener.addTargetGroups(`${agentId}GRPC`, {
      targetGroups: [
        new ApplicationTargetGroup(scope, `${agentId}GRPCGroup`, {
          targetType: TargetType.IP,
          protocol: ApplicationProtocol.HTTP,
          protocolVersion: ApplicationProtocolVersion.GRPC,
          port: GRPCPortNumber,
          vpc,
          healthCheck: {
            port: GRPCPortNumber.toString(),
            protocol: Protocol.HTTP,
            path: '/helloworld.Greeter/SayHello' // non-existent endpoint on purpose
          },
          targets: [
            fgService.loadBalancerTarget({
              containerName: containerDetails.agent.containerName,
              containerPort: GRPCPortNumber
            })
          ]
        })
      ]
    });

    fgService.connections.allowFrom(service.loadBalancer, GRPCPort);
    service.loadBalancer.connections.allowTo(fgService, GRPCPort);

    const paths = ['/api/*', '/ca-api/*', '/ca-apiws/*', '/a2a/*'];
    // HTTPS target
    this.addHttpsTarget(scope, `${id}Agent`, props, {
      priority: 100,
      containerName: containerDetails.agent.containerName,
      containerPort: 8080,
      paths,
      efsSg: containerDetails.agent.task?.efsSg
    });
    return paths;
  }

  addHttpsTarget(
    scope: cdk.Construct,
    id: string,
    props: TargetsProps,
    containerProps: TargetProps
  ): void {
    const { service, httpsListener } = props;
    const {
      containerName,
      containerPort,
      priority,
      paths,
      healthCheckPath,
      efsSg,
      dbSg
    } = containerProps;
    const fgService = service.service;
    httpsListener.addTargets(`${id}ECSHTTPSTarget`, {
      protocol: ApplicationProtocol.HTTP,
      port: containerPort,
      priority,
      conditions: [ListenerCondition.pathPatterns(paths)],
      targets: [
        fgService.loadBalancerTarget({
          containerName,
          containerPort
        })
      ],
      healthCheck: {
        port: containerPort.toString(),
        protocol: Protocol.HTTP,
        path: healthCheckPath != null ? healthCheckPath : '/'
      }
    });

    fgService.connections.allowFrom(service.loadBalancer, Port.tcp(443));
    service.loadBalancer.connections.allowTo(
      fgService,
      Port.tcp(containerPort)
    );

    const serviceSg = fgService.connections.securityGroups[0];

    if (efsSg != null) {
      efsSg.addIngressRule(serviceSg, NFSPort);
      serviceSg.addEgressRule(efsSg, NFSPort);
    }
    if (dbSg != null) {
      dbSg.addIngressRule(serviceSg, PostgresPort);
      serviceSg.addEgressRule(dbSg, PostgresPort);
    }
  }
}
