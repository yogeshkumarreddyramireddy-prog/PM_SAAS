import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  gpsCoordinates?: { lat: number, lng: number };
  golfCourseId: number;
  category: 'live_maps' | 'reports' | 'hd_maps' | '3d_models';
}

export interface DroneUploadState {
  isUploading: boolean;
  uploadProgress: number;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
  errorMessage: string;
  selectedFiles: File[];
  flightDate: string;
  flightTime: string;
  golfCourseId?: number;
}

interface UploadContextType {
  uploadingFiles: UploadingFile[];
  setUploadingFiles: React.Dispatch<React.SetStateAction<UploadingFile[]>>;
  removeFile: (id: string) => void;
  getFilesForCategory: (golfCourseId: number, category: string) => UploadingFile[];
  
  droneUploadState: DroneUploadState;
  setDroneUploadState: React.Dispatch<React.SetStateAction<DroneUploadState>>;
  clearDroneUploadState: () => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  
  const initialDroneState: DroneUploadState = {
    isUploading: false,
    uploadProgress: 0,
    uploadStatus: 'idle',
    errorMessage: '',
    selectedFiles: [],
    flightDate: '',
    flightTime: ''
  };
  const [droneUploadState, setDroneUploadState] = useState<DroneUploadState>(initialDroneState);

  const removeFile = (id: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== id));
  };

  const getFilesForCategory = (golfCourseId: number, category: string) => {
    return uploadingFiles.filter(f => f.golfCourseId === golfCourseId && f.category === category);
  };

  const clearDroneUploadState = () => {
    setDroneUploadState(initialDroneState);
  };

  return (
    <UploadContext.Provider value={{ 
      uploadingFiles, setUploadingFiles, removeFile, getFilesForCategory,
      droneUploadState, setDroneUploadState, clearDroneUploadState
    }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUploadContext() {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error('useUploadContext must be used within an UploadProvider');
  }
  return context;
}
