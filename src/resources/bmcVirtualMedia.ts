import * as pulumi from "@pulumi/pulumi";

export interface BmcVirtualMediaArgs {
  redfishEndpoint: pulumi.Input<string>;
  username: pulumi.Input<string>;
  password: pulumi.Input<string>;
  isoURL: pulumi.Input<string>;
  bootDevice?: pulumi.Input<string>;
  powerAction?: pulumi.Input<string>;
}

export interface BmcVirtualMediaOutputs {
  lastAction: pulumi.Output<string>;
  mounted: pulumi.Output<boolean>;
  lastTaskState: pulumi.Output<string>;
}

class BmcProvider implements pulumi.dynamic.ResourceProvider {
  public async create(inputs: any): Promise<pulumi.dynamic.CreateResult> {
    const headers = {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${inputs.username}:${inputs.password}`).toString("base64"),
    } as any;

    const base = inputs.redfishEndpoint.replace(/\/$/, "");
    const media = inputs.bootDevice || "Cd";
    const insertUrl = `${base}/redfish/v1/Managers/1/VirtualMedia/${media}/Actions/VirtualMedia.InsertMedia`;

    let mounted = false;
    let lastTaskState = "unknown";
    try {
      await fetch(insertUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ Image: inputs.isoURL, Inserted: true }),
      });
      mounted = true;
      lastTaskState = "Inserted";
    } catch (e: any) {
      lastTaskState = `error: ${e.message}`;
    }

    if (inputs.powerAction) {
      const resetUrl = `${base}/redfish/v1/Systems/1/Actions/ComputerSystem.Reset`;
      try {
        await fetch(resetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ ResetType: inputs.powerAction }),
        });
        lastTaskState = inputs.powerAction;
      } catch (e: any) {
        lastTaskState = `error: ${e.message}`;
      }
    }

    return {
      id: base,
      outs: {
        lastAction: inputs.powerAction || "insert",
        mounted,
        lastTaskState,
      },
    };
  }
}

export class BmcVirtualMedia extends pulumi.dynamic.Resource implements BmcVirtualMediaOutputs {
  public readonly lastAction!: pulumi.Output<string>;
  public readonly mounted!: pulumi.Output<boolean>;
  public readonly lastTaskState!: pulumi.Output<string>;

  constructor(name: string, args: BmcVirtualMediaArgs, opts?: pulumi.CustomResourceOptions) {
    super(new BmcProvider(), name, { ...args, lastAction: undefined, mounted: undefined, lastTaskState: undefined }, opts);
  }
}
