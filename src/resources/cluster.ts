import * as pulumi from "@pulumi/pulumi";
import { InstallAssets, InstallAssetsArgs } from "./installAssets";
import { AgentInstall } from "./agentInstall";
import { BmcVirtualMedia, BmcVirtualMediaArgs } from "./bmcVirtualMedia";

export interface OpenshiftAgentClusterArgs extends InstallAssetsArgs {
  bmc?: pulumi.Input<BmcVirtualMediaArgs[]>;
}

export class OpenshiftAgentCluster extends pulumi.ComponentResource {
  public readonly kubeconfig: pulumi.Output<string>;

  constructor(name: string, args: OpenshiftAgentClusterArgs, opts?: pulumi.ComponentResourceOptions) {
    super("openshiftagent:OpenshiftAgentCluster", name, {}, opts);

    const { bmc, ...assetArgs } = args;

    const assets = new InstallAssets(`${name}-assets`, assetArgs, { parent: this });

    let install: pulumi.Output<AgentInstall>;
    if (bmc) {
      install = pulumi.all([pulumi.output(bmc)]).apply(([hosts]) => {
        const boots = hosts.map((h, idx) =>
          new BmcVirtualMedia(`${name}-bmc-${idx}`, h, { parent: this })
        );
        return new AgentInstall(
          `${name}-install`,
          { workdir: assets.workdir },
          { parent: this, dependsOn: boots }
        );
      });
    } else {
      install = pulumi.output(
        new AgentInstall(`${name}-install`, { workdir: assets.workdir }, { parent: this })
      );
    }

    this.kubeconfig = install.apply(i => i.kubeconfig);

    this.registerOutputs({ kubeconfig: this.kubeconfig });
  }
}
