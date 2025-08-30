import * as pulumi from "@pulumi/pulumi";
declare const fetch: any;

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
      // wait for media to be inserted
      const mediaStatus = `${base}/redfish/v1/Managers/1/VirtualMedia/${media}`;
      for (let i = 0; i < 30; i++) {
        const res = await fetch(mediaStatus, { headers });
        const info = await res.json();
        if (info.Inserted) {
          mounted = true;
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
      lastTaskState = mounted ? "Inserted" : "Timeout";
      if (!mounted) {
        throw new Error("Timed out waiting for virtual media to insert");
      }
    } catch (e: any) {
      throw new Error(`Virtual media insert failed: ${e.message}`);
    }

    // Set boot device
    const bootUrl = `${base}/redfish/v1/Systems/1`;
    try {
      await fetch(bootUrl, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ Boot: { BootSourceOverrideTarget: media, BootSourceOverrideEnabled: "Once" } }),
      });
    } catch {
      // ignore
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
        throw new Error(`Power action failed: ${e.message}`);
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
