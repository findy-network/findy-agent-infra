import { RemovalPolicy, Duration, DockerImage } from "aws-cdk-lib";
import { Bucket, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  OriginAccessIdentity,
  CloudFrontWebDistribution,
  SSLMethod,
  SecurityPolicyProtocol,
  CloudFrontAllowedMethods,
  OriginProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { DnsValidatedCertificate } from "aws-cdk-lib/aws-certificatemanager";
import { ARecord, RecordTarget, HostedZone } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import { apiPaths } from "./constants";
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { RetentionDays } from "aws-cdk-lib/aws-logs";

import { GRPCPortNumber } from "./constants";

interface FrontendProps {
  rootDomainName: string;
  appDomainPrefix: string;
  apiDomainPrefix: string;
}

export class Frontend extends Construct {
  constructor(scope: Construct, id: string, props: FrontendProps) {
    super(scope, id);

    const { rootDomainName: domainName, appDomainPrefix: subDomainName } =
      props;
    const bucketName = `${subDomainName}.${domainName}`;

    // Create S3 bucket for frontend deployment
    const bucket = new Bucket(this, `${id}-bucket`, {
      bucketName: bucketName,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html",
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true
    });

    // Source bundle
    const srcBundle = s3deploy.Source.asset('../../findy-wallet-pwa', {
      bundling: {
        command: [
          'sh', '-c',
          'npm ci && npm run build && ' +
          'apk add bash && ' +
          `./create-set-env.sh "./tools/env-docker/set-env.sh" "${bucketName}" "${process.env.API_SUB_DOMAIN_NAME}.${process.env.DOMAIN_NAME}" "${GRPCPortNumber}" && ` +
          'cp -R ./build/. /asset-output/'
        ],
        image: DockerImage.fromRegistry('public.ecr.aws/docker/library/node:18.12-alpine3.17'),
        environment: {
          REACT_APP_GQL_HOST: bucketName,
          REACT_APP_AUTH_HOST: bucketName,
          REACT_APP_HTTP_SCHEME: 'https',
          REACT_APP_WS_SCHEME: 'wss',
        },
      },
    });

    new s3deploy.BucketDeployment(this, `${id}-deployment`, {
      sources: [srcBundle],
      destinationBucket: bucket,
      logRetention: RetentionDays.ONE_MONTH
    });

    // Allow access only from cloudfront
    const bucketOriginAccessIdentity = new OriginAccessIdentity(
      this,
      `${id}-origin-access-identity`,
      {
        comment: `Access bucket ${bucketName} only from Cloudfront`,
      }
    );
    const policyStatement = new PolicyStatement();
    policyStatement.addActions("s3:GetObject*");
    policyStatement.addResources(`${bucket.bucketArn}/*`);
    policyStatement.addCanonicalUserPrincipal(
      bucketOriginAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
    );
    bucket.addToResourcePolicy(policyStatement);
    const listPolicyStatement = new PolicyStatement();
    listPolicyStatement.addActions("s3:ListBucket");
    listPolicyStatement.addResources(bucket.bucketArn);
    listPolicyStatement.addCanonicalUserPrincipal(
      bucketOriginAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
    );
    bucket.addToResourcePolicy(listPolicyStatement);

    const s3Origin = {
      s3BucketSource: bucket,
      originAccessIdentity: bucketOriginAccessIdentity,
    };

    const zone = HostedZone.fromLookup(this, `${id}-hosted-zone`, {
      domainName: domainName,
    });

    // To use an ACM certificate with Amazon CloudFront, you must request or import the certificate
    // in the US East (N. Virginia) region. ACM certificates in this region that are associated
    // with a CloudFront distribution are distributed to all the geographic locations configured for that distribution.
    const certificateArn = new DnsValidatedCertificate(
      this,
      `${id}-certificate`,
      {
        domainName: bucketName,
        hostedZone: zone,
        region: "us-east-1",
      }
    ).certificateArn;

    // CloudFront distribution with forward logic to backend
    const distribution = new CloudFrontWebDistribution(
      this,
      `${id}-distribution`,
      {
        viewerCertificate: {
          props: {
            acmCertificateArn: certificateArn,
            minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
            sslSupportMethod: SSLMethod.SNI,
          },
          aliases: [bucketName],
        },
        errorConfigurations: [
          {
            errorCode: 404,
            responsePagePath: "/index.html",
            responseCode: 200,
            errorCachingMinTtl: 0,
          },
        ],
        originConfigs: [
          {
            s3OriginSource: s3Origin,
            behaviors: [
              {
                isDefaultBehavior: true,
              },
              {
                pathPattern: "/index.html",
                maxTtl: Duration.seconds(0),
                minTtl: Duration.seconds(0),
                defaultTtl: Duration.seconds(0),
              },
              {
                pathPattern: "/version.txt",
                maxTtl: Duration.seconds(0),
                minTtl: Duration.seconds(0),
                defaultTtl: Duration.seconds(0),
              },
              {
                pathPattern: "/set-env.sh",
                maxTtl: Duration.seconds(0),
                minTtl: Duration.seconds(0),
                defaultTtl: Duration.seconds(0),
              },
            ],
          },
          {
            // TODO: can we hide API TLS endpoint from internet?
            customOriginSource: {
              domainName: `${props.apiDomainPrefix}.${domainName}`,
            },
            behaviors: [
              ...apiPaths.corePaths,
              ...apiPaths.authPaths,
              ...apiPaths.vaultPaths,
            ].map((item: string) => ({
              pathPattern: item,
              allowedMethods: CloudFrontAllowedMethods.ALL,
              forwardedValues: {
                cookies: {
                  forward: "all",
                },
                headers: ["*"],
                queryString: true,
              },
            })),
          },
        ],
      }
    );

    // Add CloudFront distribution to domain routing
    new ARecord(this, `${id}-a-record`, {
      recordName: bucketName,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      zone,
    });
  }
}
