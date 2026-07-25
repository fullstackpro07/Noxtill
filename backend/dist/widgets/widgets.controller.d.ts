import { WidgetsService } from './widgets.service';
export declare class WidgetsController {
    private readonly widgetsService;
    constructor(widgetsService: WidgetsService);
    registry(): {
        key: string;
        title: string;
        category: import("./widgets.constants").WidgetCategory;
    }[];
    data(key: string): Promise<unknown>;
}
