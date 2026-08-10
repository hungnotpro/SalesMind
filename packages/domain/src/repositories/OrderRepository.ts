import { Order, OrderItem } from '../entities/Order.js';

export interface IOrderRepository {
  findById(id: string): Promise<Order | null>;
  findBySourceMessageId(messageId: string): Promise<Order | null>;
  findByOrderNumber(orderNumber: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  update(order: Order): Promise<void>;
  listByCustomer(customerId: string, limit?: number): Promise<Order[]>;
  listByStatus(status: string, limit?: number): Promise<Order[]>;
  listRecent(limit?: number): Promise<Order[]>;
}

export interface IOrderItemRepository {
  findById(id: string): Promise<OrderItem | null>;
  findByOrderId(orderId: string): Promise<OrderItem[]>;
  save(item: OrderItem): Promise<void>;
  saveMany(items: OrderItem[]): Promise<void>;
  update(item: OrderItem): Promise<void>;
}
