import { Port } from "aws-cdk-lib/aws-ec2";

export const apiPaths = {
  authPaths: ["/register/*", "/login/*", "/attestation/*", "/assertion/*"],
  corePaths: ["/api/*", "/ca-api/*", "/ca-apiws/*", "/a2a/*"],
  vaultPaths: ["/query*"],
};

export const NFPostNumber = 2049;
export const NFSPort = Port.tcp(NFPostNumber);
export const PostgresPortNumber = 5432;
export const PostgresPort = Port.tcp(PostgresPortNumber);
export const GRPCPortNumber = 50051;
export const GRPCPort = Port.tcp(GRPCPortNumber);

export const containerNameCore = "findy-agency-core";
export const containerNameAuth = "findy-agency-auth";
export const containerNameVault = "findy-agency-vault";
