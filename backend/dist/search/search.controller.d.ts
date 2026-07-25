import { SearchService } from './search.service';
export declare class SearchController {
    private readonly searchService;
    constructor(searchService: SearchService);
    search(q: string): Promise<{
        customers: {
            id: string;
            name: string;
            phone: string;
        }[];
        products: {
            id: string;
            name: string;
        }[];
        orders: {
            id: string;
            orderNo: number;
        }[];
        appointments: {
            id: string;
            serviceName: string;
            customerName: string;
            startsAt: Date;
        }[];
        credit: {
            customerId: string;
            name: string;
            balance: number;
        }[];
    }>;
}
