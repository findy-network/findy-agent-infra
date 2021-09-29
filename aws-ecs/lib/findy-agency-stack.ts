import * as cdk from '@aws-cdk/core';
import { CIPipelineStack } from './ci-pipeline';

interface FindyAgencyStackProps extends cdk.StackProps {
  prod: boolean;
  githubTokenSecretName: string;
  walletDomainName: string;
}

export class FindyAgencyStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: FindyAgencyStackProps) {
    super(scope, id, props);

    const { env, prod, githubTokenSecretName, walletDomainName } = props;

    const containerNames = {
      auth: `${id}AuthContainer`,
      agent: `${id}AgentContainer`,
      vault: `${id}VaultContainer`
    };

    // CI Pipeline
    const ciPipeline = new CIPipelineStack(this, id, {
      env,
      prod,
      tokenSecretName: githubTokenSecretName,
      walletDomainName,
      containerNames
    });

    const containerDetails = {
      auth: {
        name: containerNames.auth,
        imageURL: ciPipeline.authImageURL
      },
      agent: {
        name: containerNames.agent,
        imageURL: ciPipeline.agentImageURL
      },
      vault: {
        name: containerNames.vault,
        imageURL: ciPipeline.vaultImageURL
      }
    };
  }
}
