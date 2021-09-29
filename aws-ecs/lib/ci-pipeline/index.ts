import * as cdk from '@aws-cdk/core';
import { Artifact, Pipeline, IStage } from '@aws-cdk/aws-codepipeline';

import {
  GitHubSourceAction,
  GitHubTrigger
} from '@aws-cdk/aws-codepipeline-actions';

import { ImagePipeline } from './image-pipeline';
import { PWAPipeline } from './pwa-pipeline';

export interface CIPipelineStackProps extends cdk.StackProps {
  prod: boolean;
  tokenSecretName: string;
  walletDomainName: string;
  containerNames: {
    agent: string;
    auth: string;
    vault: string;
  };
}

export class CIPipelineStack extends cdk.Stack {
  public agentImageURL(): string {
    return this.imagePipeline.agentImageURL;
  }

  public authImageURL(): string {
    return this.imagePipeline.authImageURL;
  }

  public vaultImageURL(): string {
    return this.imagePipeline.vaultImageURL;
  }

  private readonly imagePipeline: ImagePipeline;

  constructor(scope: cdk.Construct, id: string, props: CIPipelineStackProps) {
    super(scope, `CIPipeline`, props);

    const { tokenSecretName, containerNames } = props;

    const tokenSecret = cdk.SecretValue.secretsManager(tokenSecretName);
    const projectName = `${id}CIPipeline`;
    const pipeline = new Pipeline(this, projectName, {
      pipelineName: projectName,
      restartExecutionOnUpdate: true
    });

    const sourceStage = pipeline.addStage({
      stageName: 'Source'
    });

    const addSourceStage = (repositoryName: string) => {
      const githubOrganization = 'findy-network';
      const sources = new Artifact();

      sourceStage.addAction(
        new GitHubSourceAction({
          owner: githubOrganization,
          repo: repositoryName,
          oauthToken: tokenSecret,
          trigger: GitHubTrigger.WEBHOOK,
          branch: 'master',
          actionName: `checkout-${repositoryName}`,
          output: sources
        })
      );
      return sources;
    };
    addSourceStage('findy-agent');
    addSourceStage('findy-agent-auth');
    addSourceStage('findy-agent-vault');
    const pwaSources = addSourceStage('findy-wallet-pwa');

    const { prod, env, walletDomainName } = props;

    // ECR docker registry + image pipeline
    const imagePipeline = new ImagePipeline(this, `${id}CIPipeline`, {
      prod,
      env,
      buildInput: pwaSources,
      containerNames
    });
    this.imagePipeline = imagePipeline;

    // PWA S3 bucket + pwa pipeline
    const pwaPipeline = new PWAPipeline(this, id, {
      prod,
      env,
      walletDomainName,
      buildInput: pwaSources
    });

    pipeline.addStage({
      stageName: 'Build',
      actions: [imagePipeline.buildAction, pwaPipeline.buildAction]
    });

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [pwaPipeline.deployAction]
    });
  }
}
