import { SetContract } from "../generated/Directory/Directory";
import { getDirectory } from "./contracts";
import { log } from "@graphprotocol/graph-ts";

export function updateDirectoryAddress(event: SetContract): void {
  let name = event.params.name as i32;
  let contract = getDirectory(name.toString());
  let address = event.params.contractAddress;

  if (contract.contractAddress.notEqual(address)) {
    contract.contractAddress = address;

    contract.lastUpdateBlockNumber = event.block.number.toI32();
    contract.lastUpdateTimestamp = event.block.timestamp.toI32();
    contract.lastUpdateBlockHash = event.block.hash;
    contract.lastUpdateTransactionHash = event.transaction.hash;
    log.debug("Updated contract address for directory entity {}", [contract.id]);
    contract.save();
  }
}