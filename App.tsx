import React, { useState } from 'react';
import QuotePage from './pages/QuotePage';
import AdminPage from './pages/AdminPage';
import { db } from './firebase'; // To initialize firebase connection
import Modal from './components/ui/Modal';
import Input from './components/ui/Input';
import Button from './components/ui/Button';

type Page = 'quote' | 'admin';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('quote');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const navButtonClasses = (page: Page) =>
    `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      currentPage === page
        ? 'bg-blue-600 text-white shadow-md'
        : 'text-gray-700 hover:bg-blue-100'
    }`;

  const handleAdminNavClick = () => {
    if (currentPage !== 'admin') {
      setPasswordInput('');
      setPasswordError('');
      setIsPasswordModalOpen(true);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === '1234') {
      setCurrentPage('admin');
      setIsPasswordModalOpen(false);
    } else {
      setPasswordError('비밀번호가 틀렸습니다.');
      setPasswordInput('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <span className="font-bold text-xl text-blue-600">투어견적 프로</span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setCurrentPage('quote')}
                className={navButtonClasses('quote')}
              >
                견적 생성기
              </button>
              <button
                onClick={handleAdminNavClick}
                className={navButtonClasses('admin')}
              >
                관리자 패널
              </button>
            </div>
          </div>
        </nav>
      </header>
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        {currentPage === 'quote' ? <QuotePage /> : <AdminPage />}
      </main>
      <footer className="text-center py-4 text-gray-500 text-sm">
        <p>&copy; 2024 투어 견적 앱. 모든 권리 보유.</p>
      </footer>

      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="관리자 인증"
      >
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <Input
            label="비밀번호"
            id="admin-password"
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            autoFocus
          />
          {passwordError && <p className="text-red-500 text-sm">{passwordError}</p>}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsPasswordModalOpen(false)}>
              취소
            </Button>
            <Button type="submit">
              확인
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default App;
