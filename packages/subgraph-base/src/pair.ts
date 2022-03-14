import { BigInt, log, store, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  Pair as PairContract,
  Mint,
  Burn,
  Swap,
  Transfer,
  Sync,
} from "../generated/templates/Pair/Pair";

import { ERC20 } from "../generated/templates/Pair/ERC20";
import {
  ADDRESS_ZERO,
  GNO_ADDRESS,
  loadOrCreateAMMPair,
  loadOrCreateAMMPosition,
  loadOrCreateUser,
  gno,
  getGnoInPosition,
  removeOrSaveUser,
  updateVoteWeight,
} from "./helpers";
import { AMMPosition, User } from "../generated/schema";

export function handleTransfer(event: Transfer): void {
  const pair = loadOrCreateAMMPair(event.address);

  // ignore initial transfers for first adds
  if (
    event.params.to.toHexString() == ADDRESS_ZERO.toHexString() &&
    event.params.value.equals(BigInt.fromI32(1000))
  ) {
    return;
  }

  // user stats
  const from = event.params.from;
  const to = event.params.to;

  const userTo = loadOrCreateUser(to);
  const userFrom = loadOrCreateUser(from);

  //const pairContract = PairContract.bind(event.address);

  // liquidity token amount being transferred
  let value = event.params.value;

  // mint
  if (
    from.toHexString() == ADDRESS_ZERO.toHexString() &&
    value > BigInt.fromI32(0)
  ) {
    // update total supply
    pair.totalSupply = pair.totalSupply.plus(value);
    pair.gnoReserves = gno.balanceOf(Address.fromString(pair.id));
    if (pair.ratio == BigInt.fromI32(0)) {
      pair.ratio = pair.gnoReserves.div(pair.totalSupply);
      pair.previousRatio = pair.ratio;
    }
  }

  // burn
  if (
    event.params.to.toHexString() == ADDRESS_ZERO.toHexString() &&
    event.params.from.toHexString() == pair.id
  ) {
    pair.totalSupply = pair.totalSupply.minus(value);
    pair.gnoReserves = gno.balanceOf(Address.fromString(pair.id));
  }

  // transfer from
  if (
    from.toHexString() != ADDRESS_ZERO.toHexString() &&
    from.toHexString() != pair.id
  ) {
    const position = loadOrCreateAMMPosition(event.address, from);
    let voteWeightToSubtract = pair.ratio.times(value);
    userFrom.voteWeight = userFrom.voteWeight.minus(voteWeightToSubtract);
    // if position balance minus value is equal to 0
    // then delete position and remove user from pair.lps
    const lpsIndex = pair.lps.indexOf(userFrom.id);
    if (position.balance.minus(value) == BigInt.fromI32(0) && !lpsIndex) {
      let lps = pair.lps;
      lps.splice(lpsIndex, 1);
      pair.lps = lps;
      store.remove("AMMPosition", position.id);
    } else {
      position.balance = position.balance.minus(value);
      position.save();
    }
    removeOrSaveUser(userFrom);
  }

  // transfer to
  if (
    event.params.to.toHexString() != ADDRESS_ZERO.toHexString() &&
    to.toHexString() != pair.id
  ) {
    // increase position balance
    const position = loadOrCreateAMMPosition(event.address, to);
    position.balance = position.balance.plus(value);
    position.save();

    // increase vote weight
    userTo.voteWeight = userTo.voteWeight.plus(pair.ratio.times(value));
    removeOrSaveUser(userTo);

    // add lp
    if (!pair.lps.includes(userTo.id)) {
      let lps = pair.lps;
      lps.push(userTo.id);
      pair.lps = lps;
    }
  }
  pair.save();
}

export function handleSync(event: Sync): void {
  const pair = loadOrCreateAMMPair(event.address);
  pair.gnoReserves = gno.balanceOf(event.address);
  // gno.balanceOf(pair) / pair.totalSupply()
  pair.ratio = pair.gnoReserves.div(ERC20.bind(event.address).totalSupply());
  for (let index = 0; index < pair.lps.length; index++) {
    const user = loadOrCreateUser(
      Address.fromString(pair.lps[index].toString())
    );

    const position = loadOrCreateAMMPosition(
      event.address,
      Address.fromString(user.id)
    );

    // const position = new AMMPosition(pair.id.concat("-").concat(user.id));
    updateVoteWeight(user, position);
  }

  // set set previous ratio to current ratio
  pair.previousRatio = pair.ratio;
  pair.save();
}