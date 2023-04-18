import * as cdk from "aws-cdk-lib";

import { Template } from "aws-cdk-lib/assertions";
import { Frontend } from "../lib/frontend";

test("Frontend Created", () => {
  const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new cdk.Stack(app, "MyTestStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });

  new Frontend(stack, "MyTestFrontend", {
    rootDomainName: "example.com",
    appDomainPrefix: "myapp",
    apiDomainPrefix: "myappapi",
  });

  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::S3::Bucket", 1);
  template.resourceCountIs(
    "AWS::CloudFront::CloudFrontOriginAccessIdentity",
    1
  );
  template.resourceCountIs("AWS::CloudFront::Distribution", 1);
  template.resourceCountIs("AWS::Route53::RecordSet", 1);

  template.hasResourceProperties("AWS::S3::Bucket", {
    BucketName: "myapp.example.com",
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
  template.hasResourceProperties("AWS::CloudFront::Distribution", {
    DistributionConfig: {
      Aliases: ["myapp.example.com"],
    },
  });

  expect(template).toMatchSnapshot();
});
