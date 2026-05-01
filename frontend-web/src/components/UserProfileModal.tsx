'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, UserCog } from 'lucide-react'
import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { PasswordInput } from './PasswordInput'
import { useTranslation } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  /** Callback quando o perfil é salvo com sucesso (refresh do AuthContext, etc.). */
  onSaved?: () => void
}

/**
 * Modal de edição do próprio perfil — disponível em todos os níveis de acesso.
 * Aberto ao clicar no nome do usuário na Sidebar.
 */
export function UserProfileModal({ open, onClose, onSaved }: Props) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: '', email: '', newPassword: '', repeatPassword: '' })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    HttpClient.get('/auth/me')
      .then((u: any) => setForm({ name: u.name || '', email: u.email || '', newPassword: '', repeatPassword: '' }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  // ESC fecha
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!open || !mounted) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.newPassword && form.newPassword !== form.repeatPassword) {
      toast.error(t('profile.passwordMismatch'))
      return
    }
    setSaving(true)
    try {
      const payload: any = {}
      if (form.name) payload.name = form.name
      if (form.email) payload.email = form.email
      if (form.newPassword) payload.newPassword = form.newPassword
      await HttpClient.patch('/auth/profile', payload)
      toast.success(t('profile.updated'))
      setForm(f => ({ ...f, newPassword: '', repeatPassword: '' }))
      onSaved?.()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar perfil.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[999] p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold flex items-center gap-2 text-white">
            <UserCog className="w-4 h-4 text-indigo-400" /> {t('profile.title')}
          </h2>
          <button onClick={onClose} aria-label={t('common.close')} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-slate-400 text-center py-6">{t('common.loading')}</div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">{t('profile.name')}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-indigo-500 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">{t('profile.email')}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-indigo-500 focus:outline-none text-sm"
              />
            </div>
            <hr className="border-white/5 my-3" />
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">
                {t('profile.newPassword')} <span className="text-slate-500 font-normal">{t('profile.passwordOptional')}</span>
              </label>
              <PasswordInput
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                placeholder={t('profile.passwordMin')}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-indigo-500 focus:outline-none text-sm"
              />
            </div>
            {form.newPassword && (
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">{t('profile.repeatPassword')}</label>
                <PasswordInput
                  value={form.repeatPassword}
                  onChange={(e) => setForm({ ...form, repeatPassword: e.target.value })}
                  placeholder={t('profile.repeatPassword')}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-indigo-500 focus:outline-none text-sm"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-3">
              <button type="button" onClick={onClose}
                className="px-3 py-1.5 border border-white/10 text-slate-300 rounded-lg hover:bg-white/5 text-sm">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                <Save className="w-3.5 h-3.5" />
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  )
}
