export interface FormuleClientItem {
  id: string;                 // UUID FormuleCourseItem
  menu_item_id: number;       // → selections[].menu_item
  name: string;
  description: string;
  price: string;              // décimal en string
  image_url: string | null;
  allergen_display: any;
  dietary_tags: any;
  extra_price: string;
  display_order: number;
}

export interface FormuleClientCourse {
  id: string;                 // UUID FormuleCourse → selections[].course
  name: string;
  order: number;
  is_required: boolean;
  min_choices: number;
  max_choices: number;
  items: FormuleClientItem[];
}

export interface FormuleClient {
  id: string;                 // UUID Formule → CreateFormuleInput.formule
  name: string;
  description: string;
  price: string;
  order: number;
  courses: FormuleClientCourse[];
}