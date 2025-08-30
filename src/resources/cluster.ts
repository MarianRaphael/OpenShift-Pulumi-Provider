import * as pulumi from "@pulumi/pulumi";
import { InstallAssets, InstallAssetsArgs } from "./installAssets";
import { AgentInstall } from "./agentInstall";
import { BmcVirtualMedia, BmcVirtualMediaArgs } from "./bmcVirtualMedia";

export interface OpenshiftAgentClusterArgs extends InstallAssetsArgs {
  bmc?: pulumi.Input<BmcVirtualMediaArgs[]>;
}

export class OpenshiftAgentCluster extends pulumi.ComponentResource {
  public readonly kubeconfig: pulumi.Output<string>;
  public readonly consoleURL: pulumi.Output<string>;

  constructor(name: string, args: OpenshiftAgentClusterArgs, opts?: pulumi.ComponentResourceOptions) {
    super("openshiftagent:OpenshiftAgentCluster", name, {}, opts);

    const { bmc, ...assetArgs } = args;

    const assets = new InstallAssets(`${name}-assets`, assetArgs, { parent: this });

    const boots: BmcVirtualMedia[] = [];
    if (bmc) {
      pulumi.output(bmc).apply(hosts => {
        hosts.forEach((h, idx) => {
          boots.push(new BmcVirtualMedia(`${name}-bmc-${idx}`, h, { parent: this }));
        });
      });
    }

    const install = new AgentInstall(`${name}-install`, { workdir: assets.workdir }, { parent: this, dependsOn: boots });

    this.kubeconfig = install.kubeconfig;
    this.consoleURL = install.consoleURL;

    this.registerOutputs({ kubeconfig: this.kubeconfig, consoleURL: this.consoleURL });
  }
}
