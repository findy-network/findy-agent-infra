import { S3OriginConfig } from '@aws-cdk/aws-cloudfront';
import { HostedZone, IHostedZone } from '@aws-cdk/aws-route53';
import * as cdk from '@aws-cdk/core';
import { Cloudfront } from './cloudfront';
import { ConfigBucket } from './config-bucket';
import { ContainerDetails } from './containers';
import { ECS } from './ecs';

export interface DeploymentStackProps extends cdk.StackProps {
  agencyAddress: string;
  agencyCertificateArn: string;
  zone: IHostedZone;
  containerNames: ContainerDetails;
  prod: boolean;
  secretName: string;
  walletDomainName: string;
  walletOrigin: S3OriginConfig;
}

export class DeploymentStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: DeploymentStackProps) {
    super(scope, `Deployment`, props);

    const {
      prod,
      env,
      containerNames,
      secretName,
      agencyAddress,
      agencyCertificateArn,
      walletDomainName,
      walletOrigin,
      zone
    } = props;

    const ecsId = `${id}Deployment`;

    // ECS services config files
    const config = new ConfigBucket(this, ecsId, {
      prod,
      env
    });

    // ECS containers and load balancing
    const ecs = new ECS(this, ecsId, {
      prod,
      env,
      containerNames,
      secretName,
      agencyAddress,
      walletDomainName,
      zone,
      configBucket: config.bucket,
      apiCertificateArn: agencyCertificateArn
    });

    // Cloudfront directs the requests from public internet
    new Cloudfront(scope, ecsId, {
      loadbalancerOrigin: {
        domainName: agencyAddress
      },
      loadbalancerPaths: ecs.apiPaths,
      domainName: walletDomainName,
      s3Origin: walletOrigin,
      zone
    });
  }
}
