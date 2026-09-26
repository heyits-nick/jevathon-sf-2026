"use client";

import { useState, type FormEvent } from "react";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DIETS } from "@/lib/score/config";
import type { ScoreRequest } from "@/lib/api/types";

interface ScoreFormProps {
  onSubmit: (request: ScoreRequest) => void;
  loading: boolean;
}

export function ScoreForm({ onSubmit, loading }: ScoreFormProps) {
  const [restaurant, setRestaurant] = useState("");
  const [menuUrl, setMenuUrl] = useState("");
  const [diet, setDiet] = useState(DIETS[0].value);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ restaurant: restaurant.trim(), menu_url: menuUrl.trim(), diet });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-[1fr_1.4fr_auto_auto] sm:items-end">
      <Field id="restaurant" label="Restaurant">
        <Input
          id="restaurant"
          placeholder="Shizen"
          value={restaurant}
          onChange={(e) => setRestaurant(e.target.value)}
          required
        />
      </Field>
      <Field id="menu-url" label="Menu URL">
        <Input
          id="menu-url"
          type="url"
          placeholder="https://restaurant.com/menu"
          value={menuUrl}
          onChange={(e) => setMenuUrl(e.target.value)}
          required
        />
      </Field>
      <Field id="diet" label="Diet">
        <Select
          items={DIETS}
          value={diet}
          onValueChange={(value) => value && setDiet(value)}
        >
          <SelectTrigger id="diet" className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIETS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Button type="submit" disabled={loading}>
        {loading ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
        {loading ? "Checking…" : "Check menu"}
      </Button>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
