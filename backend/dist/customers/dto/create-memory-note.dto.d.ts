export declare class CreateMemoryNoteDto {
    subjectType: 'customer' | 'supplier' | 'product' | 'table';
    subjectId: string;
    body: string;
    pinned?: boolean;
}
