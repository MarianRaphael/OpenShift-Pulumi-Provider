# OpenShift Pulumi Provider

This project implements a Pulumi **dynamic** provider for provisioning an OpenShift cluster using the agent-based installer. All resources are written in TypeScript, so you can use the code directly without compiling a separate plugin.

## Installation

Clone the repository and install dependencies:

```bash
npm install
```

## Building & Testing

Compile the TypeScript sources to JavaScript. The `test` script runs the same build:

```bash
npm run build
# or
npm test
```

## Available Resources

The provider exports the following resources:

- `MirrorRegistry` – writes placeholder registry configuration files. It does **not** mirror images; run `oc mirror` separately if a registry mirror is required.
- `InstallAssets` – creates agent-based installer assets such as the installation ISO and optional PXE files.
- `BmcVirtualMedia` – mounts an ISO to a host's BMC via Redfish and can trigger power actions.
- `AgentInstall` – waits for the installation to finish and exposes the kubeconfig and kubeadmin password.
- `OpenshiftAgentCluster` – a higher level component that ties all the pieces together and outputs a kubeconfig.

## Example Usage

Below is a minimal Pulumi program that provisions a single node OpenShift cluster:

```typescript
import * as pulumi from "@pulumi/pulumi";
import { OpenshiftAgentCluster } from "openshift-pulumi-provider";
import * as fs from "fs";

const cluster = new OpenshiftAgentCluster("demo", {
  releaseImage: "quay.io/openshift-release-dev/ocp-release:4.17.0-x86_64",
  baseDomain: "example.com",
  clusterName: "demo",
  platform: "none",
  networking: {
    clusterCIDR: "10.128.0.0/14",
    hostPrefix: 23,
    serviceCIDR: "172.30.0.0/16",
    machineCIDR: "192.168.122.0/24",
  },
  controlPlaneReplicas: 1,
  computeReplicas: 0,
  pullSecret: fs.readFileSync("pull-secret.json", "utf8"),
  sshPubKey: fs.readFileSync("id_rsa.pub", "utf8"),
  agent: { rendezvousIP: "192.168.122.10" },
});

export const kubeconfig = cluster.kubeconfig;
```

Run the program with `pulumi up` to begin the installation.

## Notes

- `InstallAssets` invokes `openshift-install`, so the binary must be available on your `PATH`.
- `BmcVirtualMedia` relies on Redfish endpoints for mounting installation media.
