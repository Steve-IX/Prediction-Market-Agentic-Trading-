import { OrderRepository } from './orderRepository.js';
import { TradeRepository } from './tradeRepository.js';
import { PositionRepository } from './positionRepository.js';
import { MarketRepository } from './marketRepository.js';
import { ArbitrageRepository } from './arbitrageRepository.js';
import { CopyTradingRepository } from './copyTradingRepository.js';
import { SessionRepository } from './sessionRepository.js';

export interface Repositories {
  orders: OrderRepository;
  trades: TradeRepository;
  positions: PositionRepository;
  markets: MarketRepository;
  arbitrage: ArbitrageRepository;
  copyTrading: CopyTradingRepository;
  sessions: SessionRepository;
}

let repositories: Repositories | null = null;

export function getRepositories(): Repositories {
  if (!repositories) {
    repositories = {
      orders: new OrderRepository(),
      trades: new TradeRepository(),
      positions: new PositionRepository(),
      markets: new MarketRepository(),
      arbitrage: new ArbitrageRepository(),
      copyTrading: new CopyTradingRepository(),
      sessions: new SessionRepository(),
    };
  }
  return repositories;
}

export {
  OrderRepository,
  TradeRepository,
  PositionRepository,
  MarketRepository,
  ArbitrageRepository,
  CopyTradingRepository,
  SessionRepository,
};
