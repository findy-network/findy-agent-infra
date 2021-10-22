import { EcsDeployAction } from '@aws-cdk/aws-codepipeline-actions';
import { BaseService, Cluster, FargateService } from '@aws-cdk/aws-ecs';
import { HostedZone } from '@aws-cdk/aws-route53';
import * as cdk from '@aws-cdk/core';
import { pipeline } from 'stream';
import { CIPipelineStack } from './ci-pipeline';
import { DeploymentStack } from './deployment';
import { GrpcsCertStack } from './grpcs-cert';

export interface FindyAgencyStackProps extends cdk.StackProps {
  prod: boolean;
  githubConnectionArn: string;
  domainRoot: string;
  walletDomainName: string;
  apiDomainName: string;
  configSecretName: string;
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
    const deployment = new DeploymentStack(this, id, {
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

    /*
    TODO:
      const deployStage = ciPipeline.deployStage;
      const imageDefinitionsOutput = ciPipeline.imageDefinitionsOutput;
      deployStage.addAction(
        new EcsDeployAction({
          actionName: `${id}-deploy-ecs`,
          input: imageDefinitionsOutput,
          service
          )
        })
      );
    */
  }
}
