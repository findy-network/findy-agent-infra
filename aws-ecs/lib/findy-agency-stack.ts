import { HostedZone } from '@aws-cdk/aws-route53';
import * as cdk from '@aws-cdk/core';
import { CIPipelineStack } from './ci-pipeline';
import { DeploymentStack } from './deployment';
import { GrpcsCertStack } from './grpcs-cert';
import { ECSDeployStack } from './ecs-deploy';

export interface FindyAgencyStackProps extends cdk.StackProps {
  prod: boolean;
  githubConnectionArn: string;
  domainRoot: string;
  walletDomainName: string;
  apiDomainName: string;
  configSecretName: string;
  ecsVpcName: string;
  ecsClusterName: string;
  ecsServiceArn: string;
}

export class FindyAgencyStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: FindyAgencyStackProps) {
    super(scope, id, props);

    const { env, prod, apiDomainName, domainRoot } = props;

    const zone = HostedZone.fromLookup(this, `${id}HostedZone`, {
      domainName: domainRoot
    });

    const grpcsCertStack = new GrpcsCertStack(this, id, {
      env,
      prod,
      agencyAddress: apiDomainName,
      zone
    });

    const { githubConnectionArn, walletDomainName } = props;

    const names = {
      auth: `${id}AuthContainer`,
      agent: `${id}AgentContainer`,
      vault: `${id}VaultContainer`
    };

    // CI Pipeline
    const ciPipeline = new CIPipelineStack(this, id, {
      env,
      prod,
      githubConnectionArn,
      walletDomainName,
      containerNames: names
    });

    const containerNames = {
      auth: {
        containerName: names.auth,
        imageURL: ciPipeline.authImageURL()
      },
      agent: {
        containerName: names.agent,
        imageURL: ciPipeline.agentImageURL()
      },
      vault: {
        containerName: names.vault,
        imageURL: ciPipeline.vaultImageURL()
      }
    };

    const { configSecretName } = props;

    // Deployment
    new DeploymentStack(this, id, {
      env,
      prod,
      containerNames,
      agencyAddress: apiDomainName,
      agencyCertificateArn: grpcsCertStack.certificateArn,
      walletDomainName,
      walletOrigin: ciPipeline.pwaS3Origin,
      secretName: configSecretName,
      zone
    });

    const { ecsServiceArn, ecsVpcName, ecsClusterName } = props;
    if (ecsServiceArn != null) {
      new ECSDeployStack(this, id, {
        env,
        prod,
        serviceArn: ecsServiceArn,
        vpcName: ecsVpcName,
        clusterName: ecsClusterName,
        deployStage: ciPipeline.deployStage,
        actionInput: ciPipeline.imageDefinitionsOutput
      });
    }
  }
}
