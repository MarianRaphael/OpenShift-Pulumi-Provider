import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "yaml";

export interface NetworkingArgs {
  clusterCIDR: pulumi.Input<string>;
  serviceCIDR: pulumi.Input<string>;
  machineCIDR: pulumi.Input<string>;
  networkType: pulumi.Input<string>;
}

export interface AgentHostArgs {
  hostname?: pulumi.Input<string>;
  role?: pulumi.Input<string>;
  macToIface: pulumi.Input<{ name: pulumi.Input<string>; mac: pulumi.Input<string> }[]>;
}

export interface AgentArgs {
  rendezvousIP?: pulumi.Input<string>;
  hosts?: pulumi.Input<AgentHostArgs[]>;
}

export interface InstallAssetsArgs {
  releaseImage: pulumi.Input<string>;
  baseDomain: pulumi.Input<string>;
  clusterName: pulumi.Input<string>;
  platform: pulumi.Input<string>;
  networking: pulumi.Input<NetworkingArgs>;
  controlPlaneReplicas: pulumi.Input<number>;
  computeReplicas: pulumi.Input<number>;
  pullSecret: pulumi.Input<string>;
  sshPubKey: pulumi.Input<string>;
  agent?: pulumi.Input<AgentArgs>;
  mirror?: pulumi.Input<{ registriesConf?: pulumi.Input<string>; caBundle?: pulumi.Input<string> }>;
  workdir?: pulumi.Input<string>;
  serveFrom?: pulumi.Input<{ address: pulumi.Input<string>; port?: pulumi.Input<number> }>;
  emitPXE?: pulumi.Input<boolean>;
}

export interface InstallAssetsOutputs {
  isoPath: pulumi.Output<string>;
  isoURL: pulumi.Output<string | undefined>;
  workdir: pulumi.Output<string>;
}

class InstallAssetsProvider implements pulumi.dynamic.ResourceProvider {
  public async create(inputs: any): Promise<pulumi.dynamic.CreateResult> {
    const workdir = inputs.workdir || fs.mkdtempSync(path.join(os.tmpdir(), "assets-"));
    fs.mkdirSync(workdir, { recursive: true });

    const installConfig = {
      apiVersion: "v1",
      baseDomain: inputs.baseDomain,
      metadata: { name: inputs.clusterName },
      networking: inputs.networking,
      compute: [{ name: "worker", replicas: inputs.computeReplicas }],
      controlPlane: { name: "master", replicas: inputs.controlPlaneReplicas },
      platform: { none: {} },
      pullSecret: inputs.pullSecret,
      sshKey: inputs.sshPubKey,
    };
    fs.writeFileSync(path.join(workdir, "install-config.yaml"), yaml.stringify(installConfig));

    const agentConfig = {
      apiVersion: "v1alpha1",
      kind: "AgentConfig",
      rendezvousIP: inputs.agent?.rendezvousIP,
      hosts: inputs.agent?.hosts,
    };
    fs.writeFileSync(path.join(workdir, "agent-config.yaml"), yaml.stringify(agentConfig));

    const isoPath = path.join(workdir, "agent.x86_64.iso");
    fs.writeFileSync(isoPath, "");

    let isoURL: string | undefined;
    if (inputs.serveFrom) {
      const port = inputs.serveFrom.port || 8080;
      isoURL = `http://${inputs.serveFrom.address}:${port}/agent.x86_64.iso`;
    }

    return {
      id: workdir,
      outs: {
        isoPath,
        isoURL,
        workdir,
      },
    };
  }
}

export class InstallAssets extends pulumi.dynamic.Resource implements InstallAssetsOutputs {
  public readonly isoPath!: pulumi.Output<string>;
  public readonly isoURL!: pulumi.Output<string | undefined>;
  public readonly workdir!: pulumi.Output<string>;

  constructor(name: string, args: InstallAssetsArgs, opts?: pulumi.CustomResourceOptions) {
    super(new InstallAssetsProvider(), name, {
      ...args,
      isoPath: undefined,
      isoURL: undefined,
      workdir: undefined,
    }, opts);
  }
}
