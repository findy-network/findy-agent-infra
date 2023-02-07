import { CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { DnsValidatedCertificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  Port,
  SecurityGroup,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import {
  AwsLogDriver,
  Cluster,
  ContainerDefinition,
  ContainerDependency,
  ContainerImage,
  FargateTaskDefinition,
  Secret,
  HealthCheck,
  ContainerDependencyCondition,
} from "aws-cdk-lib/aws-ecs";
import { ApplicationMultipleTargetGroupsFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import {
  FileSystem,
  LifecyclePolicy,
  PerformanceMode,
} from "aws-cdk-lib/aws-efs";
import {
  ApplicationProtocol,
  ApplicationProtocolVersion,
  ApplicationTargetGroup,
  ListenerAction,
  TargetType,
  Protocol,
  ListenerCondition,
  ApplicationListener,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
} from "aws-cdk-lib/aws-rds";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { LoadBalancerTarget } from "aws-cdk-lib/aws-route53-targets";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import {
  ISecret,
  Secret as ManagerSecret,
} from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { mkdirSync, writeFileSync } from "fs";
import {
  GRPCPort,
  GRPCPortNumber,
  NFSPort,
  PostgresPort,
  apiPaths,
  containerNameCore,
  containerNameVault,
  containerNameAuth,
} from "./constants";

interface BackendProps {
  rootDomainName: string;
  appDomainPrefix: string;
  apiDomainPrefix: string;
  genesisTransactions: string;
}

interface ContainerProps {
  containerName: string;
  dependencies?: ContainerDependency[];
  imageURL: string;
  healthCheck?: HealthCheck;
  ports: number[];
  task: FargateTaskDefinition;
  volumeContainerPath?: string;
  vpc: IVpc;
  environment: {
    plainValues: Record<string, string>;
    secretValues: Record<string, string | ISecret>;
    secretSource: ISecret;
  };
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

const mapSecrets = (
  secret: ISecret,
  envVariableMap: Record<string, string | ISecret>
): Record<string, Secret> => {
  return Object.keys(envVariableMap).reduce(
    (result, key) => ({
      ...result,
      [key]:
        typeof envVariableMap[key] === "string"
          ? Secret.fromSecretsManager(secret, envVariableMap[key] as string)
          : Secret.fromSecretsManager(envVariableMap[key] as ISecret),
    }),
    {}
  );
};

export class Backend extends Construct {
  public readonly clusterName: CfnOutput;
  public readonly serviceArn: CfnOutput;
  public readonly certArn: CfnOutput;
  constructor(scope: Construct, id: string, props: BackendProps) {
    super(scope, id);

    // Create config bucket
    const bucketUniquePrefix = `${props.appDomainPrefix}${props.rootDomainName}`;
    const bucketResourceName = `${bucketUniquePrefix.replaceAll(".", "").replaceAll("-", "")}BackendConfig`;
    const bucketName = bucketResourceName.toLowerCase();

    const bucket = new Bucket(scope, bucketName, {
      bucketName: bucketName,
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
    });

    const targetFolder = "./.temp/agent";
    mkdirSync(targetFolder, { recursive: true });
    writeFileSync(
      `${targetFolder}/genesis_transactions`,
      props.genesisTransactions
    );

    // just dummy file since agency start script expects to find the folder
    const certTargetFolder = "./.temp/grpc";
    mkdirSync(certTargetFolder, { recursive: true });
    writeFileSync(`${certTargetFolder}/placeholder.txt`, "no tls");

    new BucketDeployment(scope, `${bucketName}Deployment`, {
      sources: [Source.asset("./.temp")],
      destinationBucket: bucket,
    });

    // Create task definition
    const taskRole = new Role(scope, `${id}ECSTaskRole`, {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    bucket.grantRead(taskRole); // grant read to config files

    const executionRole = new Role(scope, `${id}ECSExecutionRole`, {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    executionRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonECSTaskExecutionRolePolicy"
      )
    );

    const secret = ManagerSecret.fromSecretNameV2(
      scope,
      `${id}ECSSecret`,
      "FindyAgency"
    );
    const secretArn = secret.secretFullArn;
    if (secretArn != null) {
      executionRole.addToPolicy(
        new PolicyStatement({
          resources: [secretArn.toString()],
          actions: [
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret",
          ],
          effect: Effect.ALLOW,
        })
      );
    }

    const task = new FargateTaskDefinition(scope, `${id}ECSTask`, {
      executionRole,
      taskRole,
    });

    const vpc = new Vpc(scope, `${id}ECSLoadBalancerVpc`, {
      maxAzs: 2, // Default is all AZs in region, at least 2 required for LB
      natGateways: 1, // We need at least 1 NAT gateway to get outbound internet access from agency
    });

    const apiAddress = `${props.apiDomainPrefix}.${props.rootDomainName}`;
    const useFileLedger = props.genesisTransactions === 'no_genesis_needed';

    // core container
    const coreProps = {
      task,
      vpc,
      containerName: containerNameCore,
      environment: {
        plainValues: {
          FCLI_AGENCY_HOST_PORT: "80",
          FCLI_AGENCY_HOST_ADDRESS: apiAddress,
          FCLI_AGENCY_HOST_SCHEME: "https",
          FCLI_LOGGING: "-logtostderr=true -v=6",
          STARTUP_FILE_STORAGE_S3: bucketName,
          FCLI_IMPORT_WALLET_FILE: "",
          FCLI_IMPORT_WALLET_NAME: "",
          FCLI_POOL_GENESIS_TXN_FILE: !useFileLedger ? '/agent/genesis_transactions' : '',
          FCLI_POOL_NAME: !useFileLedger ? 'findy' : 'FINDY_FILE_LEDGER',
          FCLI_AGENCY_POOL_NAME: !useFileLedger ? 'FINDY_LEDGER,findy,FINDY_MEM_LEDGER,cache' : 'FINDY_FILE_LEDGER'
        },
        secretValues: {
          FCLI_AGENCY_STEWARD_WALLET_KEY: "findy-agency-steward-wallet-key",
          FCLI_AGENCY_STEWARD_DID: "findy-agency-steward-did",
          FCLI_AGENCY_STEWARD_SEED: "findy-agency-steward-seed",
          FCLI_AGENCY_GRPC_JWT_SECRET: "findy-agency-jwt-key",
          FCLI_AGENCY_ADMIN_ID: "findy-agency-admin-id",
          FCLI_AGENCY_ENCLAVE_KEY: "findy-agency-enclave-key",
        },
        secretSource: secret,
      },
      imageURL: "ghcr.io/findy-network/findy-agent",
      ports: [8080, GRPCPortNumber],
      volumeContainerPath: "/root",
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:8080/ready || exit 1"],
        retries: 10,
      },
    };
    const core = this.addContainer(scope, coreProps);

    // vault container
    const dbPasswordJSONField = "findy-agency-db-password";

    const dbPassword = secret.secretValueFromJson(dbPasswordJSONField);
    const dbSecurityGroup = new SecurityGroup(
      scope,
      `${id}VaultRDSSecurityGroup`,
      {
        vpc,
        allowAllOutbound: true,
      }
    );
    // https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-versions.html
    const db = new DatabaseInstance(scope, `${id}VaultRDS`, {
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_13_6,
      }),
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      vpc,
      databaseName: "vault",
      port: 5432,
      removalPolicy: RemovalPolicy.DESTROY,
      credentials: {
        username: "postgres",
        password: dbPassword,
      },
      securityGroups: [dbSecurityGroup],
    });
    const dbHost = db.dbInstanceEndpointAddress;
    const vaultProps = {
      task,
      vpc,
      containerName: containerNameVault,
      environment: {
        plainValues: {
          FAV_AGENCY_HOST: "localhost", // TODO: load balancing when scaling up
          FAV_DB_HOST: dbHost,
          FAV_AGENCY_CERT_PATH: "",
          FAV_AGENCY_INSECURE: "true",
        },
        secretValues: {
          FAV_JWT_KEY: "findy-agency-jwt-key",
          FAV_AGENCY_ADMIN_ID: "findy-agency-admin-id",
          FAV_DB_PASSWORD: dbPasswordJSONField,
        },
        secretSource: secret,
      },
      imageURL: "ghcr.io/findy-network/findy-agent-vault",
      ports: [8085],
      dependencies: [
        {
          container: core.container,
          condition: ContainerDependencyCondition.HEALTHY,
        },
      ],
    };
    const vault = this.addContainer(scope, vaultProps);

    // auth container
    const appDomain = `${props.appDomainPrefix}.${props.rootDomainName}`;
    const authProps = {
      task,
      vpc,
      containerName: containerNameAuth,
      environment: {
        plainValues: {
          FAA_AGENCY_ADDR: "localhost",
          FAA_DOMAIN: appDomain,
          FAA_ORIGIN: `https://${appDomain}`,
          FAA_CERT_PATH: "",
          FAA_AGENCY_INSECURE: "true",
        },
        secretValues: {
          FAA_JWT_VERIFICATION_KEY: "findy-agency-jwt-key",
          FAA_SEC_KEY: "findy-agency-sec-key",
          FAA_AGENCY_ADMIN_ID: "findy-agency-admin-id",
        },
        secretSource: secret,
      },
      imageURL: "ghcr.io/findy-network/findy-agent-auth",
      ports: [8888],
      volumeContainerPath: "/data",
      dependencies: [
        {
          container: core.container,
          condition: ContainerDependencyCondition.HEALTHY,
        },
      ],
    };
    const auth = this.addContainer(scope, authProps);

    // server cert for GRPC connections
    const zone = HostedZone.fromLookup(this, `${id}HostedZone`, {
      domainName: props.rootDomainName,
    });

    const certificate = new DnsValidatedCertificate(scope, `${id}Certificate`, {
      domainName: apiAddress,
      hostedZone: zone,
    });

    const cluster = new Cluster(scope, `${id}ECSCluster`, {
      vpc,
    });

    const lbService = new ApplicationMultipleTargetGroupsFargateService(
      scope,
      `${id}Service`,
      {
        cluster,
        cpu: 512,
        desiredCount: 1,
        taskDefinition: task,
        memoryLimitMiB: 1024,
      }
    );

    // Load Balancer exposes default HTTPS-port and GRPC-port to outside world
    // TODO: disable default listener on port 80
    const loadBalancer = lbService.loadBalancer;
    loadBalancer.setAttribute("idle_timeout.timeout_seconds", "3600");
    const httpsListener = loadBalancer.addListener(`${id}HTTPSListener`, {
      protocol: ApplicationProtocol.HTTPS,
      port: 443,
      certificates: [certificate],
      defaultAction: ListenerAction.fixedResponse(404),
    });

    const grpcListener = loadBalancer.addListener(`${id}GRPCListener`, {
      protocol: ApplicationProtocol.HTTPS,
      port: 50051,
      certificates: [certificate],
    });

    new ARecord(scope, `${id}ARecord`, {
      recordName: apiAddress,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(loadBalancer)),
      zone,
    });

    // core targets
    const fgService = lbService.service;
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
            path: "/helloworld.Greeter/SayHello", // non-existent endpoint on purpose
          },
          targets: [
            fgService.loadBalancerTarget({
              containerName: coreProps.containerName,
              containerPort: GRPCPortNumber,
            }),
          ],
        }),
      ],
    });

    fgService.connections.allowFrom(lbService.loadBalancer, GRPCPort);
    lbService.loadBalancer.connections.allowTo(fgService, GRPCPort);

    // HTTPS target
    this.addHttpsTarget(`${id}Agent`, httpsListener, lbService, {
      priority: 100,
      containerName: coreProps.containerName,
      containerPort: 8080,
      paths: apiPaths.corePaths,
      efsSg: core.efsSg,
    });

    // auth target
    this.addHttpsTarget(`${id}Auth`, httpsListener, lbService, {
      priority: 99,
      containerName: authProps.containerName,
      containerPort: 8888,
      paths: apiPaths.authPaths,
      efsSg: auth.efsSg,
    });

    // vault target
    this.addHttpsTarget(`${id}Vault`, httpsListener, lbService, {
      priority: 98,
      containerName: vaultProps.containerName,
      containerPort: 8085,
      paths: apiPaths.vaultPaths,
      dbSg: dbSecurityGroup,
      healthCheckPath: "/health",
    });

    this.clusterName = new CfnOutput(this, "ClusterName", {
      value: cluster.clusterName,
    });
    this.serviceArn = new CfnOutput(this, "ServiceArn", {
      value: lbService.service.serviceArn,
    });
    this.certArn = new CfnOutput(this, "CertArn", {
      value: certificate.certificateArn,
    });
  }

  addContainer(
    scope: Construct,
    props: ContainerProps
  ): {
    container: ContainerDefinition;
    efsSg?: SecurityGroup;
  } {
    const {
      containerName,
      dependencies,
      environment,
      healthCheck,
      imageURL,
      ports,
      task,
      volumeContainerPath,
      vpc,
    } = props;

    // Create container with environment variables, port configurations etc.
    const container = task.addContainer(containerName, {
      image: ContainerImage.fromRegistry(imageURL),
      environment: environment.plainValues,
      secrets: mapSecrets(environment.secretSource, environment.secretValues),
      logging: new AwsLogDriver({
        streamPrefix: containerName,
        logRetention: RetentionDays.ONE_MONTH,
      }),
      healthCheck,
      portMappings: ports.map((containerPort) => ({ containerPort })),
    });

    // Add startup dependencies if any
    if (dependencies != null) {
      container.addContainerDependencies(...dependencies);
    }

    // Add EFS volume if any
    if (volumeContainerPath != null) {
      const {
        volumeName,
        securityGroup: efsSg,
        efs,
      } = this.addEfs(scope, containerName, vpc);

      container.addMountPoints({
        containerPath: volumeContainerPath,
        sourceVolume: volumeName,
        readOnly: false,
      });
      task.addVolume({
        name: volumeName,
        efsVolumeConfiguration: efs,
      });

      return { container, efsSg };
    }

    return { container };
  }

  addEfs(
    scope: Construct,
    id: string,
    vpc: IVpc
  ): { volumeName: string; securityGroup: SecurityGroup; efs: FileSystem } {
    const securityGroup = new SecurityGroup(scope, `${id}EFSSecurityGroup`, {
      vpc,
      allowAllOutbound: true,
    });

    const efs = new FileSystem(scope, `${id}EFS`, {
      vpc,
      securityGroup,
      encrypted: true,
      lifecyclePolicy: LifecyclePolicy.AFTER_90_DAYS,
      performanceMode: PerformanceMode.GENERAL_PURPOSE,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    return { volumeName: `${id}EFSVolume`, securityGroup, efs };
  }

  addHttpsTarget(
    id: string,
    httpsListener: ApplicationListener,
    service: ApplicationMultipleTargetGroupsFargateService,
    props: TargetProps
  ): void {
    const {
      containerName,
      containerPort,
      priority,
      paths,
      healthCheckPath,
      efsSg,
      dbSg,
    } = props;
    const fgService = service.service;
    httpsListener.addTargets(`${id}ECSHTTPSTarget`, {
      protocol: ApplicationProtocol.HTTP,
      port: containerPort,
      priority,
      conditions: [ListenerCondition.pathPatterns(paths)],
      targets: [
        fgService.loadBalancerTarget({
          containerName,
          containerPort,
        }),
      ],
      healthCheck: {
        port: containerPort.toString(),
        protocol: Protocol.HTTP,
        path: healthCheckPath != null ? healthCheckPath : "/",
      },
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
