import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  margin?: number;
  colorDark?: string;
  colorLight?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  className?: string;
  onError?: (error: Error) => void;
  onGenerated?: (dataURL: string) => void;
}

const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  value,
  size = 200,
  margin = 1,
  colorDark = '#000000',
  colorLight = '#FFFFFF',
  errorCorrectionLevel = 'M',
  className = '',
  onError,
  onGenerated
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generateQRCode = async () => {
      if (!canvasRef.current || !value) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        await QRCode.toCanvas(canvasRef.current, value, {
          width: size,
          margin,
          color: {
            dark: colorDark,
            light: colorLight
          },
          errorCorrectionLevel
        });

        // Optionnel : générer aussi le dataURL pour callback
        if (onGenerated) {
          const dataURL = await QRCode.toDataURL(value, {
            width: size,
            margin,
            color: {
              dark: colorDark,
              light: colorLight
            },
            errorCorrectionLevel
          });
          onGenerated(dataURL);
        }

        setIsLoading(false);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Erreur génération QR Code');
        setError(error.message);
        setIsLoading(false);
        if (onError) {
          onError(error);
        }
      }
    };

    generateQRCode();
  }, [value, size, margin, colorDark, colorLight, errorCorrectionLevel, onError, onGenerated]);

  if (error) {
    return (
      <div 
        className={`flex items-center justify-center border border-red-300 bg-red-50 text-red-600 rounded ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-xs text-center px-2">
          Erreur QR Code: {error}
        </span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div 
        className={`flex items-center justify-center border border-gray-300 bg-gray-50 rounded ${className}`}
        style={{ width: size, height: size }}
      >
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600"></div>
      </div>
    );
  }

  return (
    <canvas 
      ref={canvasRef} 
      className={`border border-gray-300 rounded ${className}`}
    />
  );
};

export default QRCodeDisplay;

// Hook pour générer des QR codes programmatiquement
export const useQRCode = () => {
  const generateDataURL = async (
    value: string,
    options?: {
      width?: number;
      margin?: number;
      colorDark?: string;
      colorLight?: string;
      errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    }
  ): Promise<string> => {
    try {
      return await QRCode.toDataURL(value, {
        width: options?.width || 200,
        margin: options?.margin || 1,
        color: {
          dark: options?.colorDark || '#000000',
          light: options?.colorLight || '#FFFFFF'
        },
        errorCorrectionLevel: options?.errorCorrectionLevel || 'M'
      });
    } catch (error) {
      throw new Error(`Erreur génération QR Code: ${error}`);
    }
  };

  const generateSVG = async (
    value: string,
    options?: {
      width?: number;
      margin?: number;
      colorDark?: string;
      colorLight?: string;
      errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    }
  ): Promise<string> => {
    try {
      return await QRCode.toString(value, {
        type: 'svg',
        width: options?.width || 200,
        margin: options?.margin || 1,
        color: {
          dark: options?.colorDark || '#000000',
          light: options?.colorLight || '#FFFFFF'
        },
        errorCorrectionLevel: options?.errorCorrectionLevel || 'M'
      });
    } catch (error) {
      throw new Error(`Erreur génération QR Code SVG: ${error}`);
    }
  };

  return {
    generateDataURL,
    generateSVG
  };
};