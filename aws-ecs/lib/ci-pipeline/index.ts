import * as cdk from '@aws-cdk/core';
import { Artifact, Pipeline, IStage } from '@aws-cdk/aws-codepipeline';

import { CodeStarConnectionsSourceAction } from '@aws-cdk/aws-codepipeline-actions';

import { ImagePipeline } from './image-pipeline';
import { PWAPipeline } from './pwa-pipeline';
import { S3OriginConfig } from '@aws-cdk/aws-cloudfront';

export interface CIPipelineStackProps extends cdk.StackProps {
  prod: boolean;
  githubConnectionArn: string;
  walletDomainName: string;
  containerNames: {
    agent: string;
    auth: string;
    vault: string;
  };
}

export class CIPipelineStack extends cdk.Stack {
  public readonly pwaS3Origin: S3OriginConfig;
  public readonly deployStage: IStage;
  public readonly imageDefinitionsOutput: Artifact;

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

    const { githubConnectionArn, containerNames } = props;

    const projectName = `${id}CIPipeline`;
    const pipeline = new Pipeline(this, projectName, {
      pipelineName: projectName,
      restartExecutionOnUpdate: true
    });

    const sourceStage = pipeline.addStage({
      stageName: 'Source'
    });

    const addSourceStage = (repositoryName: string): Artifact => {
      const githubOrganization = 'findy-network';
      const sources = new Artifact();

      sourceStage.addAction(
        new CodeStarConnectionsSourceAction({
          connectionArn: githubConnectionArn,
          actionName: `checkout-${repositoryName}`,
          owner: githubOrganization,
          repo: repositoryName,
          branch: 'master',
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
    this.imageDefinitionsOutput = imagePipeline.imageDetails;

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

    this.deployStage = pipeline.addStage({
      stageName: 'Deploy',
      actions: [pwaPipeline.deployAction]
    });

    this.pwaS3Origin = pwaPipeline.s3Origin;
  }
}
