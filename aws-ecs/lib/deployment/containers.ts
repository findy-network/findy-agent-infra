import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  SecurityGroup
} from '@aws-cdk/aws-ec2';
import {
  AwsLogDriver,
  ContainerDefinition,
  ContainerDependency,
  ContainerDependencyCondition,
  ContainerImage,
  FargateTaskDefinition,
  HealthCheck,
  Secret
} from '@aws-cdk/aws-ecs';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { ISecret } from '@aws-cdk/aws-secretsmanager';
import * as cdk from '@aws-cdk/core';
import { FileSystem, LifecyclePolicy, PerformanceMode } from '@aws-cdk/aws-efs';
import { RemovalPolicy } from '@aws-cdk/core';
import {
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion
} from '@aws-cdk/aws-rds';

export interface ContainersProps {
  env: cdk.Environment | undefined;
  prod: boolean;
  task: FargateTaskDefinition;
  vpc: IVpc;
  containerNames: ContainerDetails;
  hostAddress: string;
  walletDomainName: string;
  configBucketName: string;
  secret: ISecret;
}

export interface ContainerDetails {
  agent: {
    containerName: string;
    imageURL: string;
    task?: ContainerTask;
  };
  auth: {
    containerName: string;
    imageURL: string;
    task?: ContainerTask;
  };
  vault: {
    containerName: string;
    imageURL: string;
    task?: ContainerTask;
  };
}

export interface ContainerTask {
  container: ContainerDefinition;
  efsSg?: SecurityGroup;
  dbSg?: SecurityGroup;
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

const mapSecrets = (
  secret: ISecret,
  envVariableMap: Record<string, string | ISecret>
): Record<string, Secret> => {
  return Object.keys(envVariableMap).reduce(
    (result, key) => ({
      ...result,
      [key]:
        typeof envVariableMap[key] === 'string'
          ? Secret.fromSecretsManager(secret, envVariableMap[key] as string)
          : Secret.fromSecretsManager(envVariableMap[key] as ISecret)
    }),
    {}
  );
};

export class Containers {
  public readonly containerDetails: ContainerDetails;
  constructor(scope: cdk.Construct, id: string, props: ContainersProps) {
    const agent = this.addAgentContainer(scope, id, props);
    const auth = this.addAuthContainer(scope, id, props, agent.container);
    const vault = this.addVaultContainer(scope, id, props, agent.container);
    this.containerDetails = {
      ...props.containerNames,
      agent: {
        ...props.containerNames.agent,
        task: agent
      },
      auth: {
        ...props.containerNames.auth,
        task: auth
      },
      vault: {
        ...props.containerNames.vault,
        task: vault
      }
    };
  }

  addAgentContainer(
    scope: cdk.Construct,
    id: string,
    props: ContainersProps
  ): ContainerTask {
    const {
      prod,
      configBucketName,
      hostAddress,
      containerNames: {
        agent: { containerName, imageURL }
      },
      secret,
      task,
      vpc
    } = props;
    const containerProps = {
      task,
      vpc,
      containerName,
      environment: {
        plainValues: {
          FCLI_AGENCY_HOST_PORT: '80',
          FCLI_AGENCY_HOST_ADDRESS: hostAddress,
          FCLI_AGENCY_HOST_SCHEME: 'https',
          FCLI_LOGGING: '-logtostderr=true -v=6',
          STARTUP_FILE_STORAGE_S3: configBucketName,
          FCLI_IMPORT_WALLET_FILE: '/agent/steward.exported',
          FCLI_POOL_GENESIS_TXN_FILE: '/agent/genesis_transactions'
        },
        secretValues: {
          FCLI_IMPORT_WALLET_KEY: 'findy-agency-steward-wallet-key',
          FCLI_IMPORT_WALLET_FILE_KEY:
            'findy-agency-steward-wallet-imported-key',
          FCLI_AGENCY_STEWARD_WALLET_KEY: 'findy-agency-steward-wallet-key',
          FCLI_AGENCY_STEWARD_DID: 'findy-agency-steward-did',
          FCLI_AGENCY_GRPC_JWT_SECRET: 'findy-agency-jwt-key',
          FCLI_AGENCY_ADMIN_ID: 'findy-agency-admin-id',
          FCLI_AGENCY_ENCLAVE_KEY: 'findy-agency-enclave-key'
        },
        secretSource: secret
      },
      imageURL,
      ports: [8080, 50051],
      volumeContainerPath: '/root',
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8080/ || exit 1']
      }
    };
    return this.addContainer(scope, id, prod, containerProps);
  }

  addAuthContainer(
    scope: cdk.Construct,
    id: string,
    props: ContainersProps,
    agentContainer: ContainerDefinition
  ): ContainerTask {
    const {
      prod,
      configBucketName,
      hostAddress,
      walletDomainName,
      containerNames: {
        auth: { containerName, imageURL }
      },
      secret,
      task,
      vpc
    } = props;
    const containerProps = {
      task,
      vpc,
      containerName,
      environment: {
        plainValues: {
          FAA_AGENCY_ADDR: hostAddress,
          FAA_DOMAIN: walletDomainName,
          FAA_ORIGIN: `https://${walletDomainName}`,
          STARTUP_FILE_STORAGE_S3: configBucketName
        },
        secretValues: {
          FAA_JWT_VERIFICATION_KEY: 'findy-agency-jwt-key',
          FAA_SEC_KEY: 'findy-agency-sec-key',
          FAA_AGENCY_ADMIN_ID: 'findy-agency-admin-id'
        },
        secretSource: secret
      },
      imageURL,
      ports: [8888],
      volumeContainerPath: '/data',
      dependencies: [
        {
          container: agentContainer,
          condition: ContainerDependencyCondition.HEALTHY
        }
      ]
    };
    return this.addContainer(scope, id, prod, containerProps);
  }

  addVaultContainer(
    scope: cdk.Construct,
    id: string,
    props: ContainersProps,
    agentContainer: ContainerDefinition
  ): ContainerTask {
    const {
      prod,
      configBucketName,
      hostAddress,
      containerNames: {
        vault: { containerName, imageURL }
      },
      secret,
      task,
      vpc
    } = props;

    const dbPasswordJSONField = 'findy-agency-db-password';

    // Create RDS
    const dbPassword = secret.secretValueFromJson(dbPasswordJSONField);
    const dbSecurityGroup = new SecurityGroup(
      scope,
      `${id}VaultRDSSecurityGroup`,
      {
        vpc,
        allowAllOutbound: true
      }
    );
    const db = new DatabaseInstance(scope, `${id}VaultRDS`, {
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.of('13.1', '13')
      }),
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      vpc,
      databaseName: 'vault',
      port: 5432,
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      credentials: {
        username: 'postgres',
        password: dbPassword
      },
      securityGroups: [dbSecurityGroup]
    });

    // Container
    const dbHost = db.dbInstanceEndpointAddress;
    const containerProps = {
      task,
      vpc,
      containerName,
      environment: {
        plainValues: {
          FAV_AGENCY_HOST: hostAddress,
          FAV_DB_HOST: dbHost,
          STARTUP_FILE_STORAGE_S3: configBucketName
        },
        secretValues: {
          FAV_JWT_KEY: 'findy-agency-jwt-key',
          FAV_AGENCY_ADMIN_ID: 'findy-agency-admin-id',
          FAV_DB_PASSWORD: dbPasswordJSONField
        },
        secretSource: secret
      },
      imageURL,
      ports: [8085],
      dependencies: [
        {
          container: agentContainer,
          condition: ContainerDependencyCondition.HEALTHY
        }
      ]
    };
    return {
      ...this.addContainer(scope, id, prod, containerProps),
      dbSg: dbSecurityGroup
    };
  }

  addContainer(
    scope: cdk.Construct,
    id: string,
    prod: boolean,
    props: ContainerProps
  ): { container: ContainerDefinition; efsSg?: SecurityGroup } {
    const {
      containerName,
      dependencies,
      environment,
      healthCheck,
      imageURL,
      ports,
      task,
      volumeContainerPath,
      vpc
    } = props;

    // Create container with environment variables, port configurations etc.
    const container = task.addContainer(containerName, {
      image: ContainerImage.fromRegistry(imageURL),
      environment: environment.plainValues,
      secrets: mapSecrets(environment.secretSource, environment.secretValues),
      logging: new AwsLogDriver({
        streamPrefix: containerName,
        logRetention: prod ? RetentionDays.INFINITE : RetentionDays.ONE_WEEK
      }),
      healthCheck,
      portMappings: ports.map((containerPort) => ({ containerPort }))
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
        efs
      } = this.addEfs(scope, containerName, prod, vpc);

      container.addMountPoints({
        containerPath: volumeContainerPath,
        sourceVolume: volumeName,
        readOnly: false
      });
      task.addVolume({
        name: volumeName,
        efsVolumeConfiguration: efs
      });

      return { container, efsSg };
    }

    return { container };
  }

  addEfs(
    scope: cdk.Construct,
    id: string,
    prod: boolean,
    vpc: IVpc
  ): { volumeName: string; securityGroup: SecurityGroup; efs: FileSystem } {
    const securityGroup = new SecurityGroup(scope, `${id}EFSSecurityGroup`, {
      vpc,
      allowAllOutbound: true
    });

    const efs = new FileSystem(scope, `${id}EFS`, {
      vpc,
      securityGroup,
      encrypted: true,
      lifecyclePolicy: LifecyclePolicy.AFTER_90_DAYS,
      performanceMode: PerformanceMode.GENERAL_PURPOSE,
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
    });

    return { volumeName: `${id}EFSVolume`, securityGroup, efs };
  }
}
