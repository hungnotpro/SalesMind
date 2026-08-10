/**
 * Order API routes - GET /orders, GET /orders/:id.
 */

import { OrderService } from '@salesmind/domain';
import { Order, OrderItem } from '@salesmind/domain';
import { NotFoundError } from '@salesmind/shared';

export interface OrderListItem {
  id: string;
  orderNumber?: string;
  orderDate: string;
  status: string;
  customerId?: string;
  itemCount: number;
  discountRate?: number;
  paymentMethod?: string;
  invoiceRequired: boolean;
  reviewRequired: boolean;
  createdAt: string;
}

export interface OrderDetail {
  id: string;
  orderNumber?: string;
  orderDate: string;
  status: string;
  customerId?: string;
  customerName?: string;
  discountRate?: number;
  discountSource?: string;
  paymentMethod?: string;
  paymentSource?: string;
  invoiceRequired: boolean;
  invoiceDueAt?: string;
  notes?: string;
  items: OrderItemDetail[];
  tasks: TaskSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemDetail {
  id: string;
  rawProductName: string;
  productId?: string;
  productName?: string;
  quantity: number;
  unit: string;
  resolutionStatus: string;
  resolutionConfidence?: number;
}

export interface TaskSummary {
  id: string;
  type: string;
  title: string;
  status: string;
  priority: string;
  dueAt?: string;
}

/**
 * List orders with optional filters.
 */
export async function listOrders(
  orderService: OrderService,
  filters?: {
    status?: string;
    customerId?: string;
    limit?: number;
  }
): Promise<OrderListItem[]> {
  let orders: Order[];

  if (filters?.customerId) {
    orders = await orderService['orderRepository'].listByCustomer(filters.customerId, filters.limit);
  } else if (filters?.status) {
    orders = await orderService['orderRepository'].listByStatus(filters.status, filters.limit);
  } else {
    orders = await orderService['orderRepository'].listRecent(filters?.limit);
  }

  const listItems: OrderListItem[] = [];

  for (const order of orders) {
    const items = await orderService['orderItemRepository'].findByOrderId(order.id);
    
    listItems.push({
      id: order.id,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate.toISOString(),
      status: order.status,
      customerId: order.customerId,
      itemCount: items.length,
      discountRate: order.discountRate,
      paymentMethod: order.paymentMethod,
      invoiceRequired: order.invoiceRequired,
      reviewRequired: order.status === 'draft', // Simplified for now
      createdAt: order.createdAt.toISOString()
    });
  }

  return listItems;
}

/**
 * Get order detail by ID.
 */
export async function getOrderDetail(
  orderService: OrderService,
  orderId: string
): Promise<OrderDetail> {
  const result = await orderService.getOrderWithItems(orderId);
  
  if (!result) {
    throw new NotFoundError('Order', orderId);
  }

  const { order, items } = result;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderDate: order.orderDate.toISOString(),
    status: order.status,
    customerId: order.customerId,
    discountRate: order.discountRate,
    discountSource: order.discountSource,
    paymentMethod: order.paymentMethod,
    paymentSource: order.paymentSource,
    invoiceRequired: order.invoiceRequired,
    invoiceDueAt: order.invoiceDueAt?.toISOString(),
    notes: order.notes,
    items: items.map((item) => ({
      id: item.id,
      rawProductName: item.rawProductName,
      productId: item.productId,
      quantity: item.quantity,
      unit: item.unit,
      resolutionStatus: item.resolutionStatus,
      resolutionConfidence: item.resolutionConfidence
    })),
    tasks: [], // Tasks would be fetched from task repository
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString()
  };
}
