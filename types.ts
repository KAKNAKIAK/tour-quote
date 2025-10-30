import { DocumentReference, DocumentData, Timestamp } from 'firebase/firestore';

export interface FirestoreDocument {
  id: string;
}

export interface Country extends FirestoreDocument {
  CountryName: string;
}

export interface City extends FirestoreDocument {
  CityName: string;
  CountryRef: DocumentReference<DocumentData>;
}

export interface Category extends FirestoreDocument {
  CategoryName: string;
}

export type PricingType = "PerPerson" | "PerUnit";

export interface Product extends FirestoreDocument {
  ProductName: string;
  ProductDescription?: string;
  ProductURL?: string;
  CityRef: DocumentReference<DocumentData>;
  CategoryRef: DocumentReference<DocumentData>;
  PricingType: PricingType;
  Price_Adult?: number;
  Price_Child?: number;
  Price_Infant?: number;
  Price_Unit?: number;
  LastModified?: Timestamp;
  // For display purposes after fetching related data
  CityName?: string;
  CategoryName?: string;
}

export interface QuoteItem {
  id: string; // Unique ID for the item in the quote
  product: Product;
  quantity: number;
  appliedPrice: number;
  total: number;
}

export interface QuoteDay {
  id: string; // Unique ID for the day
  items: QuoteItem[];
  dayTotal: number;
}

export interface QuoteInfo {
  customerName: string;
  countryId: string;
  cityId: string;
  pax: {
    adults: number;
    children: number;
    infants: number;
  };
}

export interface Quote {
  info: QuoteInfo;
  days: QuoteDay[];
  grandTotal: number;
}
