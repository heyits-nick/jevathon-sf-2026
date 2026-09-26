"use client";

import { useState, type FormEvent } from "react";
import { Loader2Icon, PlaneTakeoffIcon } from "lucide-react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DIETS } from "@/lib/score/config";
import type { CreateTripRequest } from "@/lib/api/types";
import { InlineError } from "./inline-error";

const UNSET = "unset";
const DIET_OPTIONS = [{ value: UNSET, label: "Not set yet" }, ...DIETS];

interface TripStartFormProps {
  onCreate: (req: CreateTripRequest) => void;
  pending: boolean;
  error?: string;
}

export function TripStartForm({ onCreate, pending, error }: TripStartFormProps) {
  const [destination, setDestination] = useState("");
  const [diet, setDiet] = useState(UNSET);
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const preferences = {
      ...(diet !== UNSET && { diet }),
      ...(budget.trim() && { budget: budget.trim() }),
      ...(notes.trim() && { notes: notes.trim() }),
    };
    onCreate({
      ...(destination.trim() && { destination: destination.trim() }),
      ...(Object.keys(preferences).length > 0 && { preferences }),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field id="destination" label="Destination">
        <Input id="destination" placeholder="New York" value={destination} onChange={(e) => setDestination(e.target.value)} />
      </Field>
      <Field id="trip-diet" label="Diet">
        <Select items={DIET_OPTIONS} value={diet} onValueChange={(value) => value && setDiet(value)}>
          <SelectTrigger id="trip-diet" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIET_OPTIONS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="budget" label="Budget">
        <Input id="budget" placeholder="Under $25 a person" value={budget} onChange={(e) => setBudget(e.target.value)} />
      </Field>
      <Field id="notes" label="Anything else" className="sm:col-span-2">
        <Textarea id="notes" placeholder="Walkable from DUMBO, lunch spots" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PlaneTakeoffIcon />}
          {pending ? "Creating trip…" : "Start trip"}
        </Button>
        {error && <InlineError message={error} />}
      </div>
    </form>
  );
}
