import {Component, ElementRef, OnInit} from '@angular/core';
import {UntilDestroy} from "@ngneat/until-destroy";
import { HttpService } from 'src/app/services/http.service';
import {tap} from "rxjs/operators";
import {IMozaic, IMozaicItem} from "../../model/app-model";

@UntilDestroy()
@Component({
  selector: 'app-channel2-page',
  templateUrl: './channel2-page.component.html',
  styleUrls: ['./channel2-page.component.scss']
})
export class Channel2PageComponent {



}
