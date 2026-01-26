'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/simple-ui';
import { ChevronDown, Plus, X } from 'lucide-react';

interface NichoSelectorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function NichoSelector({ value, onChange, placeholder = "Selecione ou digite...", disabled = false }: NichoSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const [options, setOptions] = useState<string[]>([]);
    const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Fetch unique niches
        const fetchNiches = async () => {
            try {
                const res = await fetch('/api/cold-leads/niches');
                const data = await res.json();
                if (data.data) {
                    setOptions(data.data);
                }
            } catch (err) {
                console.error('Failed to fetch niches', err);
            }
        };
        fetchNiches();
    }, []);

    // Sync internal state with prop, but only if they differ significantly to avoid cursor jumps
    // Or just always sync? For a controlled input, always syncing is correct, but let's be careful.
    useEffect(() => {
        if (value !== inputValue) {
            setInputValue(value);
        }
    }, [value]);

    useEffect(() => {
        if (inputValue === '') {
            setFilteredOptions(options);
        } else {
            const lowerInput = inputValue.toLowerCase();
            setFilteredOptions(options.filter(opt => opt.toLowerCase().includes(lowerInput)));
        }
    }, [inputValue, options]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setInputValue(newVal);
        onChange(newVal);
        setIsOpen(true);
    };

    const handleOptionClick = (option: string) => {
        setInputValue(option);
        onChange(option);
        setIsOpen(false);
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        setInputValue('');
        onChange('');
        inputRef.current?.focus();
    };

    const showCreateOption = inputValue && !options.some(opt => opt.toLowerCase() === inputValue.toLowerCase());

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div className="relative">
                <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className="pr-16 text-slate-900 placeholder:text-slate-400" // make room for icons and ensure contrast
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {inputValue && !disabled && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                    <div className="text-slate-400 pointer-events-none">
                        <ChevronDown className="h-4 w-4" />
                    </div>
                </div>
            </div>

            {isOpen && !disabled && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredOptions.length > 0 && (
                        <div className="py-1">
                            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Existentes
                            </div>
                            {filteredOptions.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                                    onClick={() => handleOptionClick(option)}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    )}

                    {showCreateOption && (
                        <div className="border-t border-slate-100 py-1">
                            <button
                                type="button"
                                className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none flex items-center gap-2"
                                onClick={() => handleOptionClick(inputValue)}
                            >
                                <Plus className="h-3 w-3" />
                                Criar "{inputValue}"
                            </button>
                        </div>
                    )}

                    {filteredOptions.length === 0 && !showCreateOption && (
                        <div className="px-4 py-2 text-sm text-slate-400">
                            Digite para criar...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
