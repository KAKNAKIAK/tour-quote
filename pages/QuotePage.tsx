import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, where, doc, getDoc, getDocs } from 'firebase/firestore';
import { useFirestoreCollection } from '../hooks/useFirestoreCollection';
import { Country, City, Category, Product, Quote, QuoteDay, QuoteItem, QuoteInfo } from '../types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { generateTextQuote, exportCsvQuote } from '../services/exportService';

const QuotePage: React.FC = () => {
    const { data: countries } = useFirestoreCollection<Country>('Countries');
    const { data: allCities } = useFirestoreCollection<City>('Cities');
    
    const [quoteInfo, setQuoteInfo] = useState<QuoteInfo>({
        customerName: '',
        countryId: '',
        cityId: '',
        pax: { adults: 1, children: 0, infants: 0 },
    });
    
    const [days, setDays] = useState<QuoteDay[]>([{ id: crypto.randomUUID(), items: [], dayTotal: 0 }]);
    const [grandTotal, setGrandTotal] = useState(0);

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [activeDayId, setActiveDayId] = useState<string | null>(null);
    
    const availableCities = useMemo(() => {
        if (!quoteInfo.countryId) return [];
        return allCities.filter(city => city.CountryRef.id === quoteInfo.countryId);
    }, [quoteInfo.countryId, allCities]);

    const handleInfoChange = (field: keyof QuoteInfo, value: any) => {
        if (field === 'pax') {
            setQuoteInfo(prev => ({ ...prev, pax: { ...prev.pax, ...value }}));
        } else {
            setQuoteInfo(prev => ({ ...prev, [field]: value }));
        }
    };
    
    useEffect(() => {
        if (quoteInfo.countryId && !availableCities.find(c => c.id === quoteInfo.cityId)) {
            setQuoteInfo(prev => ({ ...prev, cityId: '' }));
        }
    }, [quoteInfo.countryId, quoteInfo.cityId, availableCities]);


    const calculateTotals = useCallback(() => {
        let newGrandTotal = 0;
        const updatedDays = days.map(day => {
            let newDayTotal = 0;
            const updatedItems = day.items.map(item => {
                let itemTotal = 0;
                if (item.product.PricingType === 'PerPerson') {
                    const adultPrice = item.product.Price_Adult || 0;
                    const childPrice = item.product.Price_Child || 0;
                    const infantPrice = item.product.Price_Infant || 0;
                    itemTotal = (quoteInfo.pax.adults * adultPrice) + (quoteInfo.pax.children * childPrice) + (quoteInfo.pax.infants * infantPrice);
                } else { // PerUnit
                    itemTotal = item.quantity * item.appliedPrice;
                }
                item.total = itemTotal;
                newDayTotal += itemTotal;
                return item;
            });
            day.items = updatedItems;
            day.dayTotal = newDayTotal;
            newGrandTotal += newDayTotal;
            return day;
        });
        setDays(updatedDays);
        setGrandTotal(newGrandTotal);
    }, [days, quoteInfo.pax]);

    useEffect(() => {
        calculateTotals();
    }, [quoteInfo.pax, calculateTotals]);
    
    const addDay = () => setDays([...days, { id: crypto.randomUUID(), items: [], dayTotal: 0 }]);
    const removeDay = (id: string) => setDays(days.filter(d => d.id !== id));

    const openProductSelector = (dayId: string) => {
        setActiveDayId(dayId);
        setIsProductModalOpen(true);
    };
    
    const addProductToDay = (product: Product) => {
        const newQuoteItem: QuoteItem = {
            id: crypto.randomUUID(),
            product: product,
            quantity: 1,
            appliedPrice: product.Price_Unit || 0,
            total: 0, // will be calculated
        };
        const updatedDays = days.map(d => {
            if (d.id === activeDayId) {
                return { ...d, items: [...d.items, newQuoteItem] };
            }
            return d;
        });
        setDays(updatedDays);
        setIsProductModalOpen(false);
        setActiveDayId(null);
    };
    
    const updateQuoteItem = (dayId: string, itemId: string, field: 'quantity' | 'appliedPrice', value: number) => {
        const updatedDays = days.map(day => {
            if (day.id === dayId) {
                const updatedItems = day.items.map(item => {
                    if (item.id === itemId) {
                        return { ...item, [field]: value };
                    }
                    return item;
                });
                return { ...day, items: updatedItems };
            }
            return day;
        });
        setDays(updatedDays);
    };

    const removeQuoteItem = (dayId: string, itemId: string) => {
        const updatedDays = days.map(day => {
            if (day.id === dayId) {
                return { ...day, items: day.items.filter(item => item.id !== itemId) };
            }
            return day;
        });
        setDays(updatedDays);
    }

    const fullQuote: Quote = { info: quoteInfo, days, grandTotal };

    return (
      <div className="space-y-8">
        <div className="p-6 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">1. 기본 정보</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Input label="고객명" id="customer-name" value={quoteInfo.customerName} onChange={e => handleInfoChange('customerName', e.target.value)} />
                <Select label="국가" id="country" value={quoteInfo.countryId} onChange={e => handleInfoChange('countryId', e.target.value)}>
                    <option value="">국가 선택</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.CountryName}</option>)}
                </Select>
                <Select label="도시" id="city" value={quoteInfo.cityId} onChange={e => handleInfoChange('cityId', e.target.value)} disabled={!quoteInfo.countryId}>
                    <option value="">도시 선택</option>
                    {availableCities.map(c => <option key={c.id} value={c.id}>{c.CityName}</option>)}
                </Select>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
                <Input label="성인" id="pax-adults" type="number" min="0" value={quoteInfo.pax.adults} onChange={e => handleInfoChange('pax', { adults: parseInt(e.target.value) || 0 })} />
                <Input label="아동" id="pax-children" type="number" min="0" value={quoteInfo.pax.children} onChange={e => handleInfoChange('pax', { children: parseInt(e.target.value) || 0 })} />
                <Input label="유아" id="pax-infants" type="number" min="0" value={quoteInfo.pax.infants} onChange={e => handleInfoChange('pax', { infants: parseInt(e.target.value) || 0 })} />
            </div>
        </div>

        <div className="p-6 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">2. 일정</h2>
            <div className="space-y-6">
                {days.map((day, index) => (
                    <div key={day.id} className="border border-gray-200 p-4 rounded-md">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-lg">{index + 1}일차</h3>
                            <Button size="sm" variant="danger" onClick={() => removeDay(day.id)} disabled={days.length <= 1}>일차 삭제</Button>
                        </div>
                        <div className="space-y-2">
                           {day.items.map(item => (
                               <div key={item.id} className="grid grid-cols-12 gap-2 items-center p-2 bg-gray-50 rounded">
                                   <div className="col-span-12 md:col-span-4 font-medium">{item.product.ProductName}</div>
                                   <div className="col-span-4 md:col-span-2 text-sm text-gray-600">{item.product.PricingType === 'PerPerson' ? '인당' : '단위당'}</div>
                                   {item.product.PricingType === 'PerUnit' ? (
                                    <>
                                       <div className="col-span-4 md:col-span-2">
                                         <Input label="수량" type="number" min="1" value={item.quantity} onChange={(e) => updateQuoteItem(day.id, item.id, 'quantity', parseInt(e.target.value))} className="py-1" />
                                       </div>
                                       <div className="col-span-4 md:col-span-2">
                                         <Input label="적용가" type="number" min="0" value={item.appliedPrice} onChange={(e) => updateQuoteItem(day.id, item.id, 'appliedPrice', parseFloat(e.target.value))} className="py-1" />
                                       </div>
                                    </>
                                   ) : <div className="col-span-8 md:col-span-4"></div>}
                                   <div className="col-span-10 md:col-span-3 font-semibold text-right">${item.total.toFixed(2)}</div>
                                   <div className="col-span-2 md:col-span-1 text-right">
                                     <button onClick={() => removeQuoteItem(day.id, item.id)} className="text-red-500 hover:text-red-700">
                                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                     </button>
                                   </div>
                               </div>
                           ))}
                        </div>
                        <div className="text-right font-bold mt-3">일차 합계: ${day.dayTotal.toFixed(2)}</div>
                        <Button size="sm" variant="secondary" onClick={() => openProductSelector(day.id)} className="mt-4" disabled={!quoteInfo.cityId}>
                           + 상품 추가
                        </Button>
                    </div>
                ))}
            </div>
            <Button onClick={addDay} className="mt-6">+ 일차 추가</Button>
        </div>

        <div className="sticky bottom-0 z-10">
            <div className="p-4 bg-white rounded-t-lg shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                <div className="flex justify-between items-center">
                    <div>
                        <span className="text-xl font-bold">총 합계: </span>
                        <span className="text-2xl font-bold text-blue-600">${grandTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => navigator.clipboard.writeText(generateTextQuote(fullQuote))}>텍스트 복사</Button>
                        <Button onClick={() => exportCsvQuote(fullQuote)} variant="secondary">CSV로 내보내기</Button>
                    </div>
                </div>
            </div>
        </div>

        {isProductModalOpen && (
            <ProductSelectorModal
                isOpen={isProductModalOpen}
                onClose={() => setIsProductModalOpen(false)}
                cityId={quoteInfo.cityId}
                onAddProduct={addProductToDay}
            />
        )}
      </div>
    );
};

interface ProductSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    cityId: string;
    onAddProduct: (product: Product) => void;
}

const ProductSelectorModal: React.FC<ProductSelectorModalProps> = ({ isOpen, onClose, cityId, onAddProduct }) => {
    const { data: categories } = useFirestoreCollection<Category>('Categories');
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchProducts = async () => {
            if (!cityId || !isOpen) return;
            setLoading(true);
            const cityRef = doc(db, 'Cities', cityId);
            const productsQuery = query(collection(db, 'Products'), where('CityRef', '==', cityRef));
            const productSnapshot = await getDocs(productsQuery);
            const fetchedProducts: Product[] = [];

            // To enrich with Category Name
            for (const doc of productSnapshot.docs) {
                const productData = { id: doc.id, ...doc.data() } as Product;
                const catDoc = await getDoc(productData.CategoryRef);
                if (catDoc.exists()) {
                    productData.CategoryName = (catDoc.data() as Category).CategoryName;
                }
                fetchedProducts.push(productData);
            }

            setProducts(fetchedProducts);
            setLoading(false);
        };
        fetchProducts();
    }, [cityId, isOpen]);

    const productsByCategory = useMemo(() => {
        return products.reduce((acc, product) => {
            const categoryName = product.CategoryName || '미분류';
            if (!acc[categoryName]) {
                acc[categoryName] = [];
            }
            acc[categoryName].push(product);
            return acc;
        }, {} as Record<string, Product[]>);
    }, [products]);

    const sortedCategories = useMemo(() => {
        return categories.filter(c => productsByCategory[c.CategoryName]).sort((a, b) => a.CategoryName.localeCompare(b.CategoryName));
    }, [categories, productsByCategory]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="상품 선택">
            {loading ? <p>상품 로딩 중...</p> : (
                <div className="space-y-4">
                    {sortedCategories.map(category => (
                        <div key={category.id}>
                            <h4 className="font-bold text-lg text-gray-700 mb-2">{category.CategoryName}</h4>
                            <ul className="space-y-2">
                                {productsByCategory[category.CategoryName].map(product => (
                                    <li key={product.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md hover:bg-blue-50 transition-colors">
                                        <div>
                                            <p className="font-medium">{product.ProductName}</p>
                                            <p className="text-sm text-gray-500">
                                                {product.PricingType === 'PerPerson'
                                                    ? `성인: $${product.Price_Adult || 0} / 아동: $${product.Price_Child || 0} / 유아: $${product.Price_Infant || 0}`
                                                    : `단위당 가격: $${product.Price_Unit || 0}`
                                                }
                                            </p>
                                        </div>
                                        <Button size="sm" onClick={() => onAddProduct(product)}>추가</Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </Modal>
    );
};

export default QuotePage;