import { Customer } from '../entities/Customer.js';

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByPhone(phone: string): Promise<Customer | null>;
  findByName(name: string): Promise<Customer[]>;
  save(customer: Customer): Promise<void>;
  update(customer: Customer): Promise<void>;
  listByStatus(status: string): Promise<Customer[]>;
}
