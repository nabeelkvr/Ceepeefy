"use client";

import React from "react";
import { useMusic } from "../context/MusicContext";

export default function DeviceModal() {
  const {
    isDeviceModalOpen,
    setIsDeviceModalOpen,
    currentDevice,
    setCurrentDevice,
  } = useMusic();

  if (!isDeviceModalOpen) return null;

  const devices = [
    {
      id: "dev-1",
      name: "Studio Monitors (Analog DAC)",
      type: "Current Device",
      icon: "speaker",
      fidelity: "24-Bit / 192kHz",
    },
    {
      id: "dev-2",
      name: "AirPods Max (Spatial Audio)",
      type: "Bluetooth Device",
      icon: "headphones",
      fidelity: "Dolby Atmos",
    },
    {
      id: "dev-3",
      name: "Living Room Hi-Fi Setup",
      type: "AirPlay / Cast",
      icon: "tv",
      fidelity: "Lossless 96kHz",
    },
    {
      id: "dev-4",
      name: "MacBook Pro Speakers",
      type: "Built-in Audio",
      icon: "laptop_mac",
      fidelity: "Standard 48kHz",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-surface-container-low/95 border border-white/10 rounded-2xl p-6 shadow-2xl overflow-hidden flex flex-col gap-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">devices</span>
            <h3 className="text-base font-bold text-white tracking-tight">Connect to a Device</h3>
          </div>
          <button
            onClick={() => setIsDeviceModalOpen(false)}
            className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {devices.map((device) => {
            const isSelected = currentDevice === device.name;
            return (
              <div
                key={device.id}
                onClick={() => {
                  setCurrentDevice(device.name);
                  setIsDeviceModalOpen(false);
                }}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-primary/15 border-primary text-white shadow-[0_0_15px_rgba(76,215,246,0.2)]"
                    : "bg-surface-container/60 border-white/5 hover:bg-surface-container hover:border-white/15 text-on-surface-variant"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`material-symbols-outlined text-[24px] ${
                      isSelected ? "text-primary" : "text-outline"
                    }`}
                  >
                    {device.icon}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-white">
                      {device.name}
                    </span>
                    <span className="text-[11px] text-outline">{device.type}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container-highest text-primary">
                    {device.fidelity}
                  </span>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_6px_#4cd7f6]" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 text-[11px] text-outline text-center">
          Hardware decoding enabled for Bit-Perfect audiophile output
        </div>
      </div>
    </div>
  );
}
