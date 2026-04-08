
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Login() {
    const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [rememberMe, setRememberMe] = useState(false)

    const { signIn } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const { error } = await signIn({ email, password })
            if (error) throw error
            navigate('/')
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#101922] flex items-center justify-center p-4 font-['Inter']">
            <div className="w-full max-w-[440px] flex flex-col gap-8">
                {/* Login Card */}
                <div className="w-full rounded-xl bg-[#1c293a] shadow-2xl border border-[#324d67] overflow-hidden">
                    {/* Branding / Header */}
                    <div className="flex flex-col items-center pt-10 pb-6 px-8 text-center">
                        {/* Logo */}
                        <div className="mb-6">
                            <img src="/assets/seca-logo.png" alt="SECA Mühendislik" className="h-20 w-auto" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                            <div className="hidden h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#137fec]/20 to-[#137fec]/5 shadow-inner border border-[#137fec]/20">
                                <span className="material-symbols-outlined text-[#137fec] text-[36px]">task_alt</span>
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">
                            Welcome to SecaTask
                        </h1>
                        <p className="text-sm text-[#92adc9]">
                            Enter your credentials to access the workspace.
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mx-8 mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-8 pb-10">
                        {/* Email Input */}
                        <div className="group">
                            <label className="block text-xs font-semibold text-[#92adc9] uppercase tracking-wider mb-2">
                                Email Address
                            </label>
                            <div className="relative flex items-center">
                                <input
                                    className="peer w-full rounded-lg border border-[#324d67] bg-[#111a22] px-4 py-3 pl-11 text-sm text-white placeholder-[#586e84] focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] outline-none transition-all"
                                    placeholder="name@company.com"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                                <div className="absolute left-3.5 text-[#586e84] peer-focus:text-[#137fec] transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">mail</span>
                                </div>
                            </div>
                        </div>

                        {/* Password Input */}
                        <div className="group">
                            <label className="block text-xs font-semibold text-[#92adc9] uppercase tracking-wider mb-2">
                                Password
                            </label>
                            <div className="relative flex items-center">
                                <input
                                    className="peer w-full rounded-lg border border-[#324d67] bg-[#111a22] px-4 py-3 pl-11 pr-11 text-sm text-white placeholder-[#586e84] focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] outline-none transition-all"
                                    placeholder="••••••••"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <div className="absolute left-3.5 text-[#586e84] peer-focus:text-[#137fec] transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">lock</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 text-[#586e84] hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[20px]">
                                        {showPassword ? 'visibility' : 'visibility_off'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Remember Me + Forgot Password */}
                        <div className="flex items-center justify-between mt-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-[#324d67] text-[#137fec] focus:ring-[#137fec] bg-[#111a22]"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                />
                                <span className="text-sm font-medium text-[#92adc9]">Remember me</span>
                            </label>
                            <a className="text-sm font-semibold text-[#137fec] hover:text-blue-400 hover:underline transition-colors" href="#">
                                Forgot password?
                            </a>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#137fec] py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-600 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2 focus:ring-offset-[#1c293a] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span>{loading ? 'Yükleniyor...' : 'Sign In'}</span>
                            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                        </button>

                    </form>

                    {/* Footer - Contact Admin */}
                    <div className="px-8 pb-8 pt-6 border-t border-[#233648]">
                        <div className="flex items-start gap-3 p-4 bg-[#1a2a38] rounded-lg border border-[#324d67]">
                            <span className="material-symbols-outlined text-[#137fec] text-xl mt-0.5">info</span>
                            <div>
                                <p className="text-sm text-white font-medium mb-1">Don't have an account?</p>
                                <p className="text-xs text-[#92adc9]">
                                    Contact your system administrator to get access to SecaTask
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center space-y-2">
                    <p className="text-xs text-[#586e84]">© 2024 Your Company Corp. Internal Use Only.</p>
                    <div className="flex justify-center gap-4 text-xs text-[#475e75]">
                        <a className="hover:text-[#92adc9] transition-colors" href="#">Privacy Policy</a>
                        <span>•</span>
                        <a className="hover:text-[#92adc9] transition-colors" href="#">Terms of Service</a>
                    </div>
                </div>
            </div>
        </div>
    )
}
