import Link from 'next/link'

export default function NotFound() {
    return (
        <div className="flex h-screen flex-col items-center justify-center bg-gray-50 text-gray-800">
            <h2 className="text-3xl font-bold mb-4">Página não encontrada (404)</h2>
            <p className="mb-6 text-gray-500">A página que você está procurando não existe.</p>
            <Link
                href="/"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
                Voltar para a Home
            </Link>
        </div>
    )
}
