import { DnsValidatedCertificate } from '@aws-cdk/aws-certificatemanager';
import * as cdk from '@aws-cdk/core';
import {
  CloudFrontWebDistribution,
  SSLMethod,
  SecurityPolicyProtocol,
  S3OriginConfig,
  CustomOriginConfig,
  CloudFrontAllowedMethods
} from '@aws-cdk/aws-cloudfront';
import { ARecord, RecordTarget, IHostedZone } from '@aws-cdk/aws-route53';
import { CloudFrontTarget } from '@aws-cdk/aws-route53-targets/lib';

export interface CloudfrontProps {
  domainName: string;
  s3Origin: S3OriginConfig;
  loadbalancerOrigin: CustomOriginConfig;
  loadbalancerPaths: string[];
  zone: IHostedZone;
}

export class Cloudfront {
  constructor(scope: cdk.Construct, id: string, props: CloudfrontProps) {
    const {
      zone,
      domainName,
      s3Origin,
      loadbalancerOrigin,
      loadbalancerPaths
    } = props;

    const cfId = `${id}CF`;

    // To use an ACM certificate with Amazon CloudFront, you must request or import the certificate
    // in the US East (N. Virginia) region. ACM certificates in this region that are associated
    // with a CloudFront distribution are distributed to all the geographic locations configured for that distribution.
    const certificateArn = new DnsValidatedCertificate(
      scope,
      `${cfId}Certificate`,
      {
        domainName,
        hostedZone: zone,
        region: 'us-east-1'
      }
    ).certificateArn;

    const distribution = new CloudFrontWebDistribution(
      scope,
      `${cfId}Distribution`,
      {
        aliasConfiguration: {
          acmCertRef: certificateArn,
          names: [domainName],
          sslMethod: SSLMethod.SNI,
          securityPolicy: SecurityPolicyProtocol.TLS_V1_2_2019
        },
        errorConfigurations: [
          {
            errorCode: 404,
            responsePagePath: '/index.html',
            responseCode: 200,
            errorCachingMinTtl: 0
          }
        ],
        originConfigs: [
          {
            s3OriginSource: s3Origin,
            behaviors: [
              {
                isDefaultBehavior: true
              },
              {
                pathPattern: '/index.html',
                maxTtl: cdk.Duration.seconds(0),
                minTtl: cdk.Duration.seconds(0),
                defaultTtl: cdk.Duration.seconds(0)
              },
              {
                pathPattern: '/version.txt',
                maxTtl: cdk.Duration.seconds(0),
                minTtl: cdk.Duration.seconds(0),
                defaultTtl: cdk.Duration.seconds(0)
              }
            ]
          },
          {
            customOriginSource: loadbalancerOrigin,
            behaviors: loadbalancerPaths.map((item) => ({
              pathPattern: item,
              allowedMethods: CloudFrontAllowedMethods.ALL,
              forwardedValues: {
                cookies: {
                  forward: 'all'
                },
                headers: ['*'],
                queryString: true
              }
            }))
          }
        ]
      }
    );

    new ARecord(scope, `${cfId}ARecord`, {
      recordName: domainName,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      zone
    });
  }
}
