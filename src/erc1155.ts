import { TransferSingle, TransferBatch } from "../generated/ERC1155Token/ERC1155Token";
import { log, BigInt, ethereum, Address } from "@graphprotocol/graph-ts";
import { getAccount, updateAccount, formatAssetType } from "./account";
import { Transfer, Account } from "../generated/schema";
import { getERC1155Token } from "./contracts";
import { getCashGroup, getCashMarket } from "./common";

export function handleTransferSingle(event: TransferSingle): void {
  let from = getAccount(event.params._from);
  updateAccount(from, event);
  log.info("Updated account entity {} for transfer", [from.id]);

  let to = getAccount(event.params._to);
  updateAccount(to, event);
  log.info("Updated account entity {} for transfer", [to.id]);

  logTransfer(
    from,
    to,
    event.params._operator,
    event.params._id,
    event.params._value,
    event
  );
}

export function handleTransferBatch(event: TransferBatch): void {
  let from = getAccount(event.params._from);
  updateAccount(from, event);
  log.info("Updated account entity {} for transfer", [from.id]);

  let to = getAccount(event.params._to);
  updateAccount(to, event);
  log.info("Updated account entity {} for transfer", [to.id]);

  let ids = event.params._ids;
  let values = event.params._values;
  for (let i: i32 = 0; i < ids.length; i++) {
    logTransfer(
      from,
      to,
      event.params._operator,
      ids[i],
      values[i],
      event
    );
  }
}

function logTransfer(
  from: Account,
  to: Account,
  operator: Address,
  assetId: BigInt,
  notional: BigInt,
  event: ethereum.Event
): string {
  let id = from.id 
    + ":" + to.id
    + ":" + assetId.toString()
    + ":" + event.transaction.hash.toHexString()
    + ":" + event.logIndex.toHexString();

  let transfer = new Transfer(id);
  transfer.blockNumber = event.block.number.toI32();
  transfer.blockTimestamp = event.block.timestamp.toI32();
  transfer.blockHash = event.block.hash;
  transfer.transactionHash = event.transaction.hash;
  transfer.gasUsed = event.transaction.gasUsed;
  transfer.gasPrice = event.transaction.gasPrice;

  transfer.operator = getAccount(operator).id;
  transfer.from = from.id;
  transfer.to = to.id;

  let erc1155 = getERC1155Token();
  let assetParams = erc1155.decodeAssetId(assetId);
  let cashGroupId = assetParams.value0 as i32;
  transfer.assetId = assetId;
  transfer.cashGroup = cashGroupId.toString();
  transfer.maturity = assetParams.value2.toI32();
  transfer.assetType = formatAssetType(assetParams.value3);

  let fcg = getCashGroup(cashGroupId.toString())
  let fcm = getCashMarket(fcg.cashMarketContract as Address, transfer.maturity);

  transfer.cashMarket = fcm.id;
  transfer.notional = notional;

  return transfer.id;
}
