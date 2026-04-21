'use client';

import { useState } from 'react';

import { Button } from '@/components/ui';

import { CreateTreeModal } from './CreateTreeModal';

interface CreateTreeButtonProps {
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * 「新しい家系図を作成」ボタン + CreateTreeModal を一体管理する Client Component。
 * Server Component (dashboard/page.tsx) から利用する。
 */
export function CreateTreeButton({
  label = '新しい家系図を作成',
  variant = 'primary',
  size = 'md',
}: CreateTreeButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => setIsModalOpen(true)}
      >
        {label}
      </Button>
      <CreateTreeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
