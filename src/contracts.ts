import { log, Address, Bytes } from "@graphprotocol/graph-ts";
import { Portfolios } from "../generated/Portfolios/Portfolios";
import { Escrow } from "../generated/Escrow/Escrow";
import { ERC1155Token } from "../generated/ERC1155Token/ERC1155Token";
import { Directory} from "../generated/schema";
import { ERC1155Trade } from "../generated/ERC1155Trade/ERC1155Trade";

const ESCROW_CONTRACT_ID = "0"
const PORTFOLIOS_CONTRACT_ID = "1"
const ERC1155_TOKEN_CONTRACT_ID = "2"
const ERC1155_TRADE_CONTRACT_ID = "3"


export function getEscrow(): Escrow {
  let contract = getDirectory(ESCROW_CONTRACT_ID);
  return Escrow.bind(contract.contractAddress as Address);
}

export function getPortfolios(): Portfolios {
  let contract = getDirectory(PORTFOLIOS_CONTRACT_ID);
  return Portfolios.bind(contract.contractAddress as Address);
}

export function getERC1155Token(): ERC1155Token {
  let contract = getDirectory(ERC1155_TOKEN_CONTRACT_ID);
  return ERC1155Token.bind(contract.contractAddress as Address);
}

export function getERC1155Trade(): ERC1155Trade {
  let contract = getDirectory(ERC1155_TRADE_CONTRACT_ID);
  return ERC1155Trade.bind(contract.contractAddress as Address);
}

export function getDirectory(id: string): Directory {
  log.debug("Retrieving directory entity {}", [id]);
  let entity = Directory.load(id);
  if (entity == null) {
    entity = new Directory(id);
    // We set this because there's a bug with byte conversion
    entity.contractAddress = Bytes.fromHexString("0x0000000000000000000000000000000000000000") as Bytes;
  }

  return entity as Directory;
}
