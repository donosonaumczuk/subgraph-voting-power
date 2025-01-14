/* eslint-disable prefer-const */
import { Address, log } from '@graphprotocol/graph-ts';
import { PairCreated } from '../generated/Factory/Factory';
import { Pair } from '../generated/templates';
import { GNO_ADDRESS } from './helpers';

export function handleNewPair(event: PairCreated): void {
  const isGnoTradingPair =
    event.params.token0.equals(GNO_ADDRESS) ||
    event.params.token1.equals(GNO_ADDRESS);

  if (isGnoTradingPair) {
    log.info('Found HoneySwap GNO POOL {}', [event.params.pair.toHex()]);
    Pair.create(event.params.pair);
  }
}
