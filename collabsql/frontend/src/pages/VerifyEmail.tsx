import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { FiCheckCircle, FiXCircle, FiLoader, FiMail } from 'react-icons/fi';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken } = useAuthStore();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'expired'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link');
      return;
    }

    verifyEmail(token);
  }, [searchParams]);

  const verifyEmail = async (token: string) => {
    try {
      const response = await authAPI.verifyEmail(token);

      setStatus('success');
      setMessage(response.data.message || 'Email verified successfully!');

      // Auto-login with the provided token
      if (response.data.token && response.data.user) {
        loginWithToken(response.data.user, response.data.token);

        toast.success('Email verified! Redirecting to dashboard...');

        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      }
    } catch (error: any) {
      const errorData = error.response?.data;

      if (errorData?.expired) {
        setStatus('expired');
        setMessage(errorData.error || 'Verification link has expired');
      } else {
        setStatus('error');
        setMessage(errorData?.error || 'Failed to verify email');
      }
    }
  };

  const handleResendVerification = async () => {
    // This would require the email - for now, redirect to login
    navigate('/login');
    toast('Please log in to resend verification email', { icon: '📧' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 mb-4">
              {status === 'verifying' && <FiLoader className="w-8 h-8 text-primary-600 animate-spin" />}
              {status === 'success' && <FiCheckCircle className="w-8 h-8 text-green-600" />}
              {(status === 'error' || status === 'expired') && <FiXCircle className="w-8 h-8 text-red-600" />}
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {status === 'verifying' && 'Verifying Your Email'}
              {status === 'success' && 'Email Verified!'}
              {status === 'error' && 'Verification Failed'}
              {status === 'expired' && 'Link Expired'}
            </h1>
          </div>

          {/* Content */}
          <div className="text-center">
            {status === 'verifying' && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="animate-pulse space-y-2">
                    <div className="h-2 w-32 bg-gray-200 rounded"></div>
                    <div className="h-2 w-24 bg-gray-200 rounded mx-auto"></div>
                  </div>
                </div>
                <p className="text-gray-600">Please wait while we verify your email...</p>
              </div>
            )}

            {status === 'success' && (
              <div className="space-y-4">
                <p className="text-gray-700 text-lg">{message}</p>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800">
                    ✨ Your account is now active! Redirecting you to the dashboard...
                  </p>
                </div>
              </div>
            )}

            {status === 'expired' && (
              <div className="space-y-4">
                <p className="text-gray-700">{message}</p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <FiMail className="w-6 h-6 text-yellow-600 mx-auto mb-2" />
                  <p className="text-sm text-yellow-800">
                    Your verification link has expired. Please request a new one.
                  </p>
                </div>
                <button
                  onClick={handleResendVerification}
                  className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
                >
                  Request New Link
                </button>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4">
                <p className="text-gray-700">{message}</p>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-800">
                    Please check your verification link or contact support if the problem persists.
                  </p>
                </div>
                <Link
                  to="/login"
                  className="block w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium text-center"
                >
                  Go to Login
                </Link>
              </div>
            )}
          </div>

          {/* Footer */}
          {status !== 'verifying' && (
            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-600">
                Need help?{' '}
                <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                  Back to Login
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
