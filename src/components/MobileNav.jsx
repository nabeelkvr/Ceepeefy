import React from "react";
import { Home, Search, Library, Heart } from "lucide-react";
import { useMusic } from "../context/MusicContext";

export default function MobileNav() {
  const { activeTab, setActiveTab } = useMusic();

  const tabs = [
    { id: "home", label: "Home", icon: Home },
    { id: "search", label: "Search", icon: Search },
    { id: "library", label: "Library", icon: Library },
    { id: "liked", label: "Liked", icon: Heart },
  ];

  return (
    <nav className="md:hidden fixed bottom-[90px] left-0 right-0 h-12 bg-black/95 backdrop-blur-lg border-t border-[#222] flex items-center justify-around z-20 px-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 flex-1 transition-colors ${
              isActive ? "text-spotify-green font-semibold" : "text-neutral-400 hover:text-white"
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? "text-spotify-green" : ""}`} />
            <span className="text-[10px]">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
