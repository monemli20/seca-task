import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'

export default function UserManagement() {
    const { user, signOut } = useAuth()
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingUser, setEditingUser] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterUnit, setFilterUnit] = useState('all')
    const [filterRole, setFilterRole] = useState('all')

    useEffect(() => {
        fetchUsers()
    }, [])

    async function fetchUsers() {
        console.log('fetchUsers called')
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .neq('role', 'registration_admin') // Kendi rolünü görmesin
                .order('updated_at', { ascending: false })

            if (error) throw error
            console.log('Fetched users count:', data?.length, 'users:', data)
            setUsers(data || [])
        } catch (error) {
            console.error('Kullanıcılar yüklenemedi:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleDeleteUser(userId) {
        console.log('Delete clicked for user:', userId)
        if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) {
            console.log('User cancelled delete')
            return
        }

        console.log('User confirmed delete, attempting deletion...')
        try {
            const { data, error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', userId)

            console.log('Delete response:', { data, error })

            if (error) throw error

            console.log('User deleted successfully')
            fetchUsers()
        } catch (error) {
            console.error('Delete error:', error)
            alert('Kullanıcı silinemedi: ' + error.message)
        }
    }

    // Filtrelenmiş kullanıcılar
    const filteredUsers = users.filter(u => {
        const matchesSearch = u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.username?.toLowerCase().includes(searchTerm.toLowerCase())

        const matchesUnit = filterUnit === 'all' || u.unit === filterUnit
        const matchesRole = filterRole === 'all' || u.role === filterRole

        return matchesSearch && matchesUnit && matchesRole
    })

    const units = ['Yönetim', 'Vision & Software', 'Atölye', 'Otomasyon', 'Mekanik', 'Satış & Pazarlama']
    const roles = [
        { value: 'user', label: 'Kullanıcı' },
        { value: 'unit_manager', label: 'Birim Amiri' },
        { value: 'super_admin', label: 'Süper Admin' }
    ]

    return (
        <div className="min-h-screen bg-slate-50 font-['Inter']">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="size-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                            <span className="material-symbols-outlined text-white">manage_accounts</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Kullanıcı Yönetimi</h1>
                            <p className="text-sm text-slate-500">Kayıt Yetkilisi Paneli</p>
                        </div>
                    </div>
                    <button
                        onClick={signOut}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                    >
                        <span className="material-symbols-outlined text-lg">logout</span>
                        <span className="text-sm font-medium">Çıkış Yap</span>
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white rounded-xl p-6 border border-slate-200">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500 mb-1">Toplam Kullanıcı</p>
                                <p className="text-3xl font-bold text-slate-800">{users.length}</p>
                            </div>
                            <div className="size-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                                <span className="material-symbols-outlined text-indigo-600">group</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-6 border border-slate-200">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500 mb-1">Yöneticiler</p>
                                <p className="text-3xl font-bold text-slate-800">
                                    {users.filter(u => u.role === 'unit_manager' || u.role === 'super_admin').length}
                                </p>
                            </div>
                            <div className="size-12 bg-amber-100 rounded-lg flex items-center justify-center">
                                <span className="material-symbols-outlined text-amber-600">admin_panel_settings</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-6 border border-slate-200">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500 mb-1">Birimler</p>
                                <p className="text-3xl font-bold text-slate-800">
                                    {new Set(users.map(u => u.unit).filter(Boolean)).size}
                                </p>
                            </div>
                            <div className="size-12 bg-green-100 rounded-lg flex items-center justify-center">
                                <span className="material-symbols-outlined text-green-600">corporate_fare</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-6 border border-slate-200">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500 mb-1">Bu Ay Eklenen</p>
                                <p className="text-3xl font-bold text-slate-800">
                                    {users.filter(u => {
                                        const userDate = new Date(u.created_at)
                                        const now = new Date()
                                        return userDate.getMonth() === now.getMonth() && userDate.getFullYear() === now.getFullYear()
                                    }).length}
                                </p>
                            </div>
                            <div className="size-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                <span className="material-symbols-outlined text-blue-600">person_add</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                    <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
                        {/* Search */}
                        <div className="relative flex-1 max-w-md">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                            <input
                                type="text"
                                placeholder="Kullanıcı ara (ad, kullanıcı adı)..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                        </div>

                        {/* Filters */}
                        <div className="flex gap-3">
                            <select
                                value={filterUnit}
                                onChange={(e) => setFilterUnit(e.target.value)}
                                className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            >
                                <option value="all">Tüm Birimler</option>
                                {units.map(unit => (
                                    <option key={unit} value={unit}>{unit}</option>
                                ))}
                            </select>

                            <select
                                value={filterRole}
                                onChange={(e) => setFilterRole(e.target.value)}
                                className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            >
                                <option value="all">Tüm Roller</option>
                                {roles.map(role => (
                                    <option key={role.value} value={role.value}>{role.label}</option>
                                ))}
                            </select>

                            <button
                                onClick={() => {
                                    setEditingUser(null)
                                    setShowModal(true)
                                }}
                                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium text-sm shadow-sm"
                            >
                                <span className="material-symbols-outlined text-lg">person_add</span>
                                <span>Yeni Kullanıcı</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* User Table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Kullanıcı</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Kullanıcı Adı</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Birim</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Rol</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Kayıt Tarihi</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                                            Yükleniyor...
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <span className="material-symbols-outlined text-5xl text-slate-300">person_search</span>
                                                <p className="text-slate-500">Kullanıcı bulunamadı</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map(u => (
                                        <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="size-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-bold">
                                                        {u.full_name?.charAt(0) || u.username?.charAt(0)?.toUpperCase() || '?'}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-slate-800">{u.full_name || 'İsimsiz'}</p>
                                                        <p className="text-sm text-slate-500">@{u.username || 'kullanıcı'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">@{u.username || 'Yok'}</td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                                    {u.unit || 'Belirtilmemiş'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${u.role === 'super_admin' ? 'bg-red-100 text-red-700' :
                                                    u.role === 'unit_manager' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-green-100 text-green-700'
                                                    }`}>
                                                    {u.role === 'super_admin' ? 'Süper Admin' :
                                                        u.role === 'unit_manager' ? 'Birim Amiri' : 'Kullanıcı'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">
                                                {u.updated_at ? new Date(u.updated_at).toLocaleDateString('tr-TR') : '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setEditingUser(u)
                                                            setShowModal(true)
                                                        }}
                                                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                                        title="Düzenle"
                                                    >
                                                        <span className="material-symbols-outlined text-slate-600 text-lg">edit</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(u.id)}
                                                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Sil"
                                                    >
                                                        <span className="material-symbols-outlined text-red-600 text-lg">delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer */}
                    {!loading && filteredUsers.length > 0 && (
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
                            <p className="text-sm text-slate-600">
                                Toplam <span className="font-semibold">{filteredUsers.length}</span> kullanıcı gösteriliyor
                            </p>
                        </div>
                    )}
                </div>
            </main>

            {/* Modal will be imported */}
            {showModal && (
                <AddUserModal
                    user={editingUser}
                    onClose={() => {
                        setShowModal(false)
                        setEditingUser(null)
                    }}
                    onSuccess={() => {
                        setShowModal(false)
                        setEditingUser(null)
                        fetchUsers()
                    }}
                />
            )}
        </div>
    )
}

// Temporary inline modal component (will be moved to separate file)
function AddUserModal({ user: editUser, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        email: editUser?.email || '',
        password: '',
        full_name: editUser?.full_name || '',
        username: editUser?.username || '',
        unit: editUser?.unit || 'Yönetim',
        role: editUser?.role || 'user'
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            if (editUser) {
                // Güncelleme
                const { error } = await supabase
                    .from('profiles')
                    .update({
                        full_name: formData.full_name,
                        username: formData.username,
                        unit: formData.unit,
                        role: formData.role
                    })
                    .eq('id', editUser.id)

                if (error) throw error
            } else {
                // Yeni kullanıcı - Auth oluştur
                // Mevcut session'ı kaydet (registration_admin'in session'ı)
                const { data: { session: currentSession } } = await supabase.auth.getSession()

                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email: formData.email,
                    password: formData.password,
                    options: {
                        data: {
                            full_name: formData.full_name,
                            username: formData.username,
                            unit: formData.unit,
                            role: formData.role
                        }
                    }
                })

                if (authError) throw authError

                // Profile güncelle
                if (authData.user) {
                    await supabase
                        .from('profiles')
                        .update({
                            full_name: formData.full_name,
                            username: formData.username,
                            unit: formData.unit,
                            role: formData.role
                        })
                        .eq('id', authData.user.id)
                }

                // Orijinal session'ı geri yükle (registration_admin olarak kal)
                if (currentSession) {
                    await supabase.auth.setSession({
                        access_token: currentSession.access_token,
                        refresh_token: currentSession.refresh_token
                    })
                }
            }

            onSuccess()
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const units = ['Yönetim', 'Vision & Software', 'Atölye', 'Otomasyon', 'Mekanik', 'Satış & Pazarlama']
    const roles = [
        { value: 'user', label: 'Kullanıcı' },
        { value: 'unit_manager', label: 'Birim Amiri' },
        { value: 'super_admin', label: 'Süper Admin' }
    ]

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-6 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800">
                        {editUser ? 'Kullanıcıyı Düzenle' : 'Yeni Kullanıcı Ekle'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <span className="material-symbols-outlined text-slate-600">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <input
                            type="email"
                            required
                            disabled={!!editUser}
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                        />
                    </div>

                    {!editUser && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Şifre</label>
                            <input
                                type="password"
                                required
                                minLength={6}
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                placeholder="Minimum 6 karakter"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Ad Soyad</label>
                        <input
                            type="text"
                            required
                            value={formData.full_name}
                            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Kullanıcı Adı</label>
                        <input
                            type="text"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Birim</label>
                            <select
                                value={formData.unit}
                                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            >
                                {units.map(unit => (
                                    <option key={unit} value={unit}>{unit}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                            <select
                                value={formData.role}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            >
                                {roles.map(role => (
                                    <option key={role.value} value={role.value}>{role.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium"
                        >
                            İptal
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Kaydediliyor...' : (editUser ? 'Güncelle' : 'Oluştur')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
