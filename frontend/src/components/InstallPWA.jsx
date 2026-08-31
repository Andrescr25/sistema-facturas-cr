import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    // Escuchar evento de instalación
    const handler = (e) => {
      e.preventDefault();
      console.log('👍 PWA instalable detectada');
      setDeferredPrompt(e);
      
      // Mostrar banner solo si no está instalada y no se ha rechazado antes
      const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
      const hasRejected = localStorage.getItem('pwa-install-rejected');
      
      if (!isInstalled && !hasRejected) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Detectar si ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('✅ App ya instalada como PWA');
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Mostrar prompt de instalación
    deferredPrompt.prompt();

    // Esperar respuesta del usuario
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`👤 Usuario ${outcome === 'accepted' ? 'aceptó' : 'rechazó'} instalar la PWA`);

    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }

    // Limpiar el evento
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowInstallBanner(false);
    localStorage.setItem('pwa-install-rejected', 'true');
  };

  // Solo mostrar en móviles
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;

  if (!showInstallBanner || !isMobile) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[100] animate-slideUp">
      <div className="bg-gradient-to-r from-primario-600 to-nota-600 text-white rounded-2xl shadow-2xl p-4 flex items-center gap-3">
        <div className="flex-shrink-0 p-2 bg-white/20 rounded-xl">
          <Download size={24} />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base mb-1">¡Instala la App!</p>
          <p className="text-sm text-primario-100">
            Acceso rápido y pantalla completa
          </p>
        </div>

        <button
          onClick={handleInstallClick}
          className="flex-shrink-0 px-4 py-2 bg-white text-primario-600 rounded-xl font-bold text-sm hover:bg-primario-50 active:scale-95 transition-all shadow-lg"
        >
          Instalar
        </button>

        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-2 hover:bg-white/10 rounded-lg transition-colors"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}

