import * as cdk from '@aws-cdk/core';
import {
  Bucket,
  BlockPublicAccess,
  BucketEncryption,
  IBucket
} from '@aws-cdk/aws-s3';
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment';

export interface ConfigBucketProps {
  env: cdk.Environment | undefined;
  prod: boolean;
  walletDomainName: string;
}

export class ConfigBucket {
  public readonly bucket: IBucket;
  constructor(scope: cdk.Construct, id: string, props: ConfigBucketProps) {
    const { prod, walletDomainName } = props;

    const bucketName = `${walletDomainName}${id}ConfigBucket`
      .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
      .replace('-', '');

    const bucket = new Bucket(scope, bucketName, {
      bucketName: bucketName,
      removalPolicy: prod
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED
    });

    new BucketDeployment(scope, `${bucketName}Deployment`, {
      sources: [Source.asset('./.secrets')],
      destinationBucket: bucket
    });

    this.bucket = bucket;
  }
}
