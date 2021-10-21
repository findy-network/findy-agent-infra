import * as cdk from '@aws-cdk/core';

import { DnsValidatedCertificate } from '@aws-cdk/aws-apigateway/node_modules/@aws-cdk/aws-certificatemanager';
import { IHostedZone } from '@aws-cdk/aws-route53';

export interface GrpcsCertStackProps extends cdk.StackProps {
  prod: boolean;
  agencyAddress: string;
  zone: IHostedZone;
}

export class GrpcsCertStack extends cdk.Stack {
  public readonly certificateArn: string;
  constructor(scope: cdk.Construct, id: string, props: GrpcsCertStackProps) {
    super(scope, `GRPCSCert`, props);

    const { agencyAddress, zone } = props;
    const certificate = new DnsValidatedCertificate(scope, `${id}Certificate`, {
      domainName: agencyAddress,
      hostedZone: zone
    });

    this.certificateArn = certificate.certificateArn;
    new cdk.CfnOutput(this, 'certificateArn', {
      value: certificate.certificateArn,
      description: 'Agency API certificate ARN',
      exportName: 'certificateArn'
    });
  }
}
