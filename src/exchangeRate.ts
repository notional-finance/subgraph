import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import { AnswerUpdated } from "../generated/PriceOracle/IAggregator";
import { PriceOracle, RateValue } from "../generated/schema";

export function handleAnswerUpdated(event: AnswerUpdated): void {
  let priceOracle: PriceOracle;

  if (event.address == Address.fromHexString("0xd866a07dea5ee3c093e21d33660b5579c21f140b")) {
    // DAI / ETH
    priceOracle = getPriceOracle(Address.fromHexString("0x773616e4d11a78f511299002da57a0a94577f1f4") as Address)
  } else if (event.address == Address.fromHexString("0x00d02526ca08488342ab634de3b2d0050ecc7f60")) {
    // USDC / ETH
    priceOracle = getPriceOracle(Address.fromHexString("0x986b5e1e1755e3c2440e960477f25201b0a8bbd4") as Address)
  } else if (event.address == Address.fromHexString("0xbd72da70007e47aaf1bbd84918675392cf6885f7")) {
    // BTC / ETH
    priceOracle = getPriceOracle(Address.fromHexString("0xdeb288f737066589598e9214e782fa5a8ed689e8") as Address)
  } else {
    priceOracle = getPriceOracle(event.address)
  }

  if (priceOracle.exchangeRate == null) {
    // This handles the case where we see an event before the oracle has been configured
    // in the system.
    return;
  }

  let rateValue = getRateValue(priceOracle.exchangeRate);
  setRateValue(rateValue, event.params.current, event);
}

export function setRateValue(rateValue: RateValue, answer: BigInt, event: ethereum.Event): void {
  rateValue.rate = answer;
  rateValue.lastUpdateBlockNumber = event.block.number.toI32();
  rateValue.lastUpdateTimestamp = event.block.timestamp.toI32();
  rateValue.lastUpdateBlockHash = event.block.hash;
  rateValue.lastUpdateTransactionHash = event.transaction.hash;
  rateValue.save();
  log.info("Updated rate value entity {}", [rateValue.id]);
}

export function getRateValue(exchangeRateId: string): RateValue {
  let entity = RateValue.load(exchangeRateId);

  if (entity == null) {
    entity = new RateValue(exchangeRateId);
    entity.exchangeRate = exchangeRateId;
  }

  return entity as RateValue;
}

export function setPriceOracle(exchangeRateId: string, address: Address): void {
  let priceOracle = getPriceOracle(address);
  priceOracle.exchangeRate = exchangeRateId;
  priceOracle.save();
  log.info("Created new price oracle entity {}", [priceOracle.id]);
}

export function getPriceOracle(address: Address): PriceOracle {
  let id = address.toHexString();

  let entity = PriceOracle.load(id);
  if (entity == null) {
    entity = new PriceOracle(id);
  }

  return entity as PriceOracle;
}