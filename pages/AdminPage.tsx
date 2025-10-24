import React, { useState, useMemo } from 'react';
import { db } from '../firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, documentId, getDocs, query, where, writeBatch, getDoc } from 'firebase/firestore';
import { useFirestoreCollection } from '../hooks/useFirestoreCollection';
import { Country, City, Category, Product, PricingType } from '../types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';

type CollectionType = 'Products' | 'Categories' | 'Cities' | 'Countries';

const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CollectionType>('Products');

  const tabs: { key: CollectionType; name: string }[] = [
    { key: 'Products', name: '상품' },
    { key: 'Categories', name: '카테고리' },
    { key: 'Cities', name: '도시' },
    { key: 'Countries', name: '국가' },
  ];

  const tabButtonClasses = (tabKey: CollectionType) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
      activeTab === tabKey
        ? 'border-blue-500 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;

  const renderContent = () => {
    switch (activeTab) {
      case 'Countries': return <ManageCountries />;
      case 'Cities': return <ManageCities />;
      case 'Categories': return <ManageCategories />;
      case 'Products': return <ManageProducts />;
      default: return null;
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">관리자 패널</h1>
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={tabButtonClasses(tab.key)}>
              {tab.name}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-6">
        {renderContent()}
      </div>
    </div>
  );
};


// Component to Manage Countries
const ManageCountries: React.FC = () => {
  const { data: countries, loading } = useFirestoreCollection<Country>('Countries');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Country | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsSubmitting(true);
    setSubmitError(null);
    try {
        if (editing) {
          await updateDoc(doc(db, 'Countries', editing.id), { CountryName: name });
        } else {
          await addDoc(collection(db, 'Countries'), { CountryName: name });
        }
        setName('');
        setEditing(null);
    } catch (error) {
        console.error("Error saving country:", error);
        setSubmitError(`국가 저장에 실패했습니다. (오류: ${(error as Error).message})`);
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleDelete = async (id: string) => {
    if(window.confirm('정말로 삭제하시겠습니까? 연관된 도시와 상품들이 모두 삭제됩니다.')) {
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const batch = writeBatch(db);
            // Find cities associated with this country
            const citiesQuery = query(collection(db, "Cities"), where("CountryRef", "==", doc(db, 'Countries', id)));
            const citiesSnapshot = await getDocs(citiesQuery);
            const cityIds = citiesSnapshot.docs.map(d => d.id);
            
            if (cityIds.length > 0) {
                // Find products associated with these cities
                const productsQuery = query(collection(db, "Products"), where("CityRef", "in", cityIds.map(cityId => doc(db, 'Cities', cityId))));
                const productsSnapshot = await getDocs(productsQuery);
                productsSnapshot.forEach(productDoc => batch.delete(productDoc.ref));
            }

            citiesSnapshot.forEach(cityDoc => batch.delete(cityDoc.ref));
            batch.delete(doc(db, 'Countries', id));
            await batch.commit();
        } catch (error) {
            console.error("Error deleting country:", error);
            setSubmitError(`국가 삭제에 실패했습니다. (오류: ${(error as Error).message})`);
        } finally {
            setIsSubmitting(false);
        }
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-4 mb-4">
        <Input label={editing ? '국가 수정' : '새 국가'} id="country" value={name} onChange={e => setName(e.target.value)} placeholder="예: 일본" />
        <div className="self-end flex gap-2">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : (editing ? '업데이트' : '추가')}</Button>
            {editing && <Button variant="secondary" onClick={() => { setEditing(null); setName(''); }} disabled={isSubmitting}>취소</Button>}
        </div>
      </form>
      {submitError && <p className="text-red-500 my-2">{submitError}</p>}
      {loading ? <p>로딩 중...</p> : (
        <ul className="space-y-2">
          {countries.map(c => <li key={c.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
            {c.CountryName}
            <div className="space-x-2">
              <Button size="sm" variant="secondary" onClick={() => { setEditing(c); setName(c.CountryName); }} disabled={isSubmitting}>수정</Button>
              <Button size="sm" variant="danger" onClick={() => handleDelete(c.id)} disabled={isSubmitting}>삭제</Button>
            </div>
          </li>)}
        </ul>
      )}
    </div>
  );
};


// Component to Manage Cities
const ManageCities: React.FC = () => {
    const { data: cities } = useFirestoreCollection<City>('Cities');
    const { data: countries } = useFirestoreCollection<Country>('Countries');
    const [cityName, setCityName] = useState('');
    const [countryId, setCountryId] = useState('');
    const [editing, setEditing] = useState<City | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const cityCountryMap = useMemo(() => {
        return cities.reduce((acc, city) => {
            const country = countries.find(c => c.id === city.CountryRef.id);
            acc[city.id] = country?.CountryName || '해당 없음';
            return acc;
        }, {} as Record<string, string>);
    }, [cities, countries]);

    const handleEdit = (city: City) => {
        setEditing(city);
        setCityName(city.CityName);
        setCountryId(city.CountryRef.id);
    }

    const handleCancelEdit = () => {
        setEditing(null);
        setCityName('');
        setCountryId('');
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cityName.trim() || !countryId) return;

        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const payload = { CityName: cityName, CountryRef: doc(db, 'Countries', countryId) };
            if (editing) {
                await updateDoc(doc(db, 'Cities', editing.id), payload);
            } else {
                await addDoc(collection(db, 'Cities'), payload);
            }
            handleCancelEdit();
        } catch(error) {
            console.error("Error saving city:", error);
            setSubmitError(`도시 저장에 실패했습니다. (오류: ${(error as Error).message})`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if(window.confirm('정말로 삭제하시겠습니까? 연관된 상품들이 모두 삭제됩니다.')) {
            setIsSubmitting(true);
            setSubmitError(null);
            try {
                const batch = writeBatch(db);
                const productsQuery = query(collection(db, "Products"), where("CityRef", "==", doc(db, 'Cities', id)));
                const productsSnapshot = await getDocs(productsQuery);
                productsSnapshot.forEach(productDoc => batch.delete(productDoc.ref));
                batch.delete(doc(db, 'Cities', id));
                await batch.commit();
            } catch (error) {
                console.error("Error deleting city:", error);
                setSubmitError(`도시 삭제에 실패했습니다. (오류: ${(error as Error).message})`);
            } finally {
                setIsSubmitting(false);
            }
        }
    }

    return (
      <div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 items-end">
            <Input label={editing ? '도시 수정' : '새 도시'} id="city" value={cityName} onChange={e => setCityName(e.target.value)} placeholder="예: 도쿄" />
            <Select label="국가" id="country-select" value={countryId} onChange={e => setCountryId(e.target.value)}>
                <option value="">국가 선택</option>
                {countries.map(c => <option key={c.id} value={c.id}>{c.CountryName}</option>)}
            </Select>
            <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : (editing ? '업데이트' : '추가')}</Button>
                {editing && <Button variant="secondary" onClick={handleCancelEdit} disabled={isSubmitting}>취소</Button>}
            </div>
        </form>
        {submitError && <p className="text-red-500 my-2">{submitError}</p>}
        <ul className="space-y-2">
            {cities.map(c => <li key={c.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span>{c.CityName} <span className="text-sm text-gray-500">({cityCountryMap[c.id]})</span></span>
                <div className="space-x-2">
                    <Button size="sm" variant="secondary" onClick={() => handleEdit(c)} disabled={isSubmitting}>수정</Button>
                    <Button size="sm" variant="danger" onClick={() => handleDelete(c.id)} disabled={isSubmitting}>삭제</Button>
                </div>
            </li>)}
        </ul>
      </div>
    )
}

// Component to Manage Categories
const ManageCategories: React.FC = () => {
    const { data: categories } = useFirestoreCollection<Category>('Categories');
    const [name, setName] = useState('');
    const [editing, setEditing] = useState<Category | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
  
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            if (editing) {
                await updateDoc(doc(db, 'Categories', editing.id), { CategoryName: name });
            } else {
                await addDoc(collection(db, 'Categories'), { CategoryName: name });
            }
            setName('');
            setEditing(null);
        } catch (error) {
            console.error("Error saving category:", error);
            setSubmitError(`카테고리 저장에 실패했습니다. (오류: ${(error as Error).message})`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if(window.confirm('정말로 삭제하시겠습니까? 연관된 상품들이 모두 삭제됩니다.')) {
            setIsSubmitting(true);
            setSubmitError(null);
            try {
                const batch = writeBatch(db);
                const productsQuery = query(collection(db, "Products"), where("CategoryRef", "==", doc(db, 'Categories', id)));
                const productsSnapshot = await getDocs(productsQuery);
                productsSnapshot.forEach(productDoc => batch.delete(productDoc.ref));
                batch.delete(doc(db, 'Categories', id));
                await batch.commit();
            } catch (error) {
                console.error("Error deleting category:", error);
                setSubmitError(`카테고리 삭제에 실패했습니다. (오류: ${(error as Error).message})`);
            } finally {
                setIsSubmitting(false);
            }
        }
    }
  
    return (
      <div>
        <form onSubmit={handleSubmit} className="flex gap-4 mb-4">
          <Input label={editing ? '카테고리 수정' : '새 카테고리'} id="category" value={name} onChange={e => setName(e.target.value)} placeholder="예: 투어" />
          <div className="self-end flex gap-2">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : (editing ? '업데이트' : '추가')}</Button>
            {editing && <Button variant="secondary" onClick={() => { setEditing(null); setName(''); }} disabled={isSubmitting}>취소</Button>}
          </div>
        </form>
        {submitError && <p className="text-red-500 my-2">{submitError}</p>}
        <ul className="space-y-2">
          {categories.map(c => <li key={c.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
            {c.CategoryName}
            <div className="space-x-2">
              <Button size="sm" variant="secondary" onClick={() => { setEditing(c); setName(c.CategoryName); }} disabled={isSubmitting}>수정</Button>
              <Button size="sm" variant="danger" onClick={() => handleDelete(c.id)} disabled={isSubmitting}>삭제</Button>
            </div>
          </li>)}
        </ul>
      </div>
    );
};

// Component to Manage Products
const ManageProducts: React.FC = () => {
    const { data: products } = useFirestoreCollection<Product>('Products');
    const { data: cities } = useFirestoreCollection<City>('Cities');
    const { data: categories } = useFirestoreCollection<Category>('Categories');
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const [productName, setProductName] = useState('');
    const [cityId, setCityId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [pricingType, setPricingType] = useState<PricingType>('PerPerson');
    const [priceAdult, setPriceAdult] = useState(0);
    const [priceChild, setPriceChild] = useState(0);
    const [priceInfant, setPriceInfant] = useState(0);
    const [priceUnit, setPriceUnit] = useState(0);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const productDetailsMap = useMemo(() => {
        const details: Record<string, {cityName: string, categoryName: string}> = {};
        products.forEach(p => {
            const city = cities.find(c => c.id === p.CityRef.id);
            const category = categories.find(c => c.id === p.CategoryRef.id);
            details[p.id] = {
                cityName: city?.CityName || '해당 없음',
                categoryName: category?.CategoryName || '해당 없음'
            };
        });
        return details;
    }, [products, cities, categories]);
    
    const resetForm = () => {
        setProductName('');
        setCityId('');
        setCategoryId('');
        setPricingType('PerPerson');
        setPriceAdult(0);
        setPriceChild(0);
        setPriceInfant(0);
        setPriceUnit(0);
        setEditingProduct(null);
        setSubmitError(null);
    }

    const openAddModal = () => {
        resetForm();
        setIsModalOpen(true);
    }

    const openEditModal = (product: Product) => {
        resetForm();
        setEditingProduct(product);
        setProductName(product.ProductName);
        setCityId(product.CityRef.id);
        setCategoryId(product.CategoryRef.id);
        setPricingType(product.PricingType);
        setPriceAdult(product.Price_Adult || 0);
        setPriceChild(product.Price_Child || 0);
        setPriceInfant(product.Price_Infant || 0);
        setPriceUnit(product.Price_Unit || 0);
        setIsModalOpen(true);
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const payload: Omit<Product, 'id'> = {
                ProductName: productName,
                CityRef: doc(db, 'Cities', cityId),
                CategoryRef: doc(db, 'Categories', categoryId),
                PricingType: pricingType,
            };

            if(pricingType === 'PerPerson') {
                payload.Price_Adult = priceAdult;
                payload.Price_Child = priceChild;
                payload.Price_Infant = priceInfant;
            } else {
                payload.Price_Unit = priceUnit;
            }

            if (editingProduct) {
                await updateDoc(doc(db, 'Products', editingProduct.id), payload);
            } else {
                await addDoc(collection(db, 'Products'), payload);
            }

            setIsModalOpen(false);
            resetForm();
        } catch (error) {
            console.error("Error saving product:", error);
            setSubmitError(`상품 저장에 실패했습니다. (오류: ${(error as Error).message})`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if(window.confirm('정말로 이 상품을 삭제하시겠습니까?')) {
            // Note: This is a simplified delete, you might want loading/error state here too
            // For simplicity, we'll keep it as is, but for a real app, add submitting state.
            try {
                await deleteDoc(doc(db, 'Products', id));
            } catch (error) {
                console.error("Error deleting product:", error);
                // In a real app, you'd show this error to the user
                alert(`상품 삭제 실패: ${(error as Error).message}`);
            }
        }
    }

    return (
      <div>
        <Button onClick={openAddModal}>새 상품 추가</Button>
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingProduct ? '상품 수정' : '상품 추가'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="상품명" id="product-name" value={productName} onChange={e => setProductName(e.target.value)} required />
                <div className="grid grid-cols-2 gap-4">
                    <Select label="도시" id="product-city" value={cityId} onChange={e => setCityId(e.target.value)} required>
                        <option value="">도시 선택</option>
                        {cities.map(c => <option key={c.id} value={c.id}>{c.CityName}</option>)}
                    </Select>
                    <Select label="카테고리" id="product-category" value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
                        <option value="">카테고리 선택</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.CategoryName}</option>)}
                    </Select>
                </div>
                <Select label="가격 유형" id="pricing-type" value={pricingType} onChange={e => setPricingType(e.target.value as PricingType)}>
                    <option value="PerPerson">인당</option>
                    <option value="PerUnit">단위당</option>
                </Select>
                {pricingType === 'PerPerson' ? (
                    <div className="grid grid-cols-3 gap-4">
                        <Input label="가격 (성인)" id="price-adult" type="number" value={priceAdult} onChange={e => setPriceAdult(parseFloat(e.target.value) || 0)} />
                        <Input label="가격 (아동)" id="price-child" type="number" value={priceChild} onChange={e => setPriceChild(parseFloat(e.target.value) || 0)} />
                        <Input label="가격 (유아)" id="price-infant" type="number" value={priceInfant} onChange={e => setPriceInfant(parseFloat(e.target.value) || 0)} />
                    </div>
                ) : (
                    <Input label="가격 (단위)" id="price-unit" type="number" value={priceUnit} onChange={e => setPriceUnit(parseFloat(e.target.value) || 0)} />
                )}

                {submitError && <p className="text-red-500 text-sm">{submitError}</p>}

                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>취소</Button>
                    <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : (editingProduct ? '상품 업데이트' : '상품 추가')}</Button>
                </div>
            </form>
        </Modal>

        <div className="mt-6 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                    <table className="min-w-full divide-y divide-gray-300">
                        <thead>
                        <tr>
                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">상품명</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">도시</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">카테고리</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">가격 유형</th>
                            <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0"><span className="sr-only">수정</span></th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                        {products.map(p => (
                            <tr key={p.id}>
                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">{p.ProductName}</td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{productDetailsMap[p.id]?.cityName}</td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{productDetailsMap[p.id]?.categoryName}</td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{p.PricingType === 'PerPerson' ? '인당' : '단위당'}</td>
                                <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                                    <div className="space-x-2">
                                        <Button size="sm" variant="secondary" onClick={() => openEditModal(p)}>수정</Button>
                                        <Button size="sm" variant="danger" onClick={() => handleDelete(p.id)}>삭제</Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </div>
    );
}

export default AdminPage;
